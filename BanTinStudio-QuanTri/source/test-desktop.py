import concurrent.futures,contextlib,http.cookiejar,importlib.util,io,json,sqlite3,sys,tempfile,threading,time,unittest,urllib.error,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).parent;sys.path.insert(0,str(ROOT/'app'));sys.path.insert(0,str(ROOT/'manager'))
from licensing import RemoteLicense,LicenseError,valid_server_url
from local_server import LocalApp
from license_server import Store,Authority

@contextlib.contextmanager
def running(server):
    t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
    try:yield f'http://127.0.0.1:{server.server_port}'
    finally:server.shutdown();server.server_close();t.join()

class DesktopTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.data=Path(self.tmp.name);self.now=1700000000.;self.store=Store(self.data/'server',clock=lambda:self.now)
    def tearDown(self):self.tmp.cleanup()
    def test_expiry_renew_revoke_machine_limit_and_database(self):
        entry=self.store.create('Khách hàng Việt',30,1);key=entry['key'];device='a'*64;nonce='n'*30
        result=self.store.check(key,device,nonce);self.assertEqual(result['valid_for'],30);self.assertEqual(result['remaining'],30*86400)
        with self.assertRaisesRegex(LicenseError,'đủ số máy'):self.store.check(key,'b'*64,nonce)
        self.now+=30*86400
        with self.assertRaisesRegex(LicenseError,'hết hạn'):self.store.check(key,device,nonce)
        self.store.update(entry['id'],'extend',{'days':30});self.assertEqual(self.store.check(key,device,nonce)['remaining'],30*86400)
        self.store.update(entry['id'],'toggle',{})
        with self.assertRaisesRegex(LicenseError,'khóa'):self.store.check(key,device,nonce)
        self.store.update(entry['id'],'toggle',{});self.store.update(entry['id'],'reset-devices',{});self.store.check(key,'b'*64,nonce)
        new=self.store.update(entry['id'],'rotate-key',{})['key']
        with self.assertRaisesRegex(LicenseError,'không tồn tại'):self.store.check(key,'b'*64,nonce)
        self.store.check(new,'b'*64,nonce)
        with self.store.connect() as c:self.assertNotIn(key,[r[0] for r in c.execute('SELECT key_hash FROM licenses')])
        self.assertEqual(Store(self.data/'server',clock=lambda:self.now).list()[0]['customer'],'Khách hàng Việt')
    def test_concurrent_activation_claims_only_one_device(self):
        entry=self.store.create('Concurrency');key=entry['key']
        def claim(i):
            try:self.store.check(key,f'{i:064x}','n'*30);return True
            except LicenseError:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as p:results=list(p.map(claim,range(8)))
        self.assertEqual(sum(results),1);self.assertEqual(self.store.list()[0]['devices'],1)
    def test_client_monotonic_cache_not_windows_date(self):
        entry=self.store.create('Clock');mono=[100.];calls=[]
        def transport(body):calls.append(body);return self.store.check(body['key'],body['device'],body['nonce'])
        client=RemoteLicense('https://license.example',self.data/'client',device='a'*64,transport=transport,clock=lambda:mono[0]);client.activate(entry['key']);self.assertEqual(len(calls),1)
        self.now+=40*86400;mono[0]+=1;self.assertTrue(client.check()['ok']);self.assertEqual(client.check()['lease_seconds'],29) # bounded cache of earlier server decision
        mono[0]+=30;self.assertFalse(client.check()['ok']);self.assertIn('hết hạn',client.state['message'])
        self.store.update(entry['id'],'extend',{'days':30});self.assertTrue(client.check()['ok'])
        def offline(body):raise LicenseError('Không có Internet.')
        client.transport=offline;mono[0]+=31;self.assertFalse(client.check()['ok'])
        # Restart does not reuse any stored active decision or client-written expiry.
        client.path.write_text(json.dumps({'key':entry['key'],'expires_at':'2999-01-01','ok':True}));fresh=RemoteLicense('https://license.example',self.data/'client',device='a'*64,transport=offline);self.assertFalse(fresh.check()['ok'])
    def test_reject_invalid_nonce_and_bad_url(self):
        c=RemoteLicense('https://example.com',self.data/'a',device='a'*64,transport=lambda b:{'ok':True,'nonce':'wrong','valid_for':30,'remaining':100,'expires_at':'x'})
        with self.assertRaises(LicenseError):c.activate('BTS-'+'A'*32)
        for url in ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com?x=1']:
            with self.assertRaises(LicenseError):valid_server_url(url)
        self.assertEqual(valid_server_url('http://127.0.0.1:8788'),'http://127.0.0.1:8788')
    def test_real_authority_http_and_local_asset_gate(self):
        authority=Authority(('127.0.0.1',0),self.store)
        def request(opener,url,path,body=None,headers=None):
            req=urllib.request.Request(url+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})})
            with opener.open(req,timeout=5) as response:return response.status,response.read()
        with running(authority) as url:
            jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
            with self.assertRaises(urllib.error.HTTPError) as e:request(opener,url,'/api/admin/licenses')
            self.assertEqual(e.exception.code,401)
            # Native loopback bootstrap requires an unguessable per-process token.
            request(opener,url,'/?launch='+authority.bootstrap)
            _,b=request(opener,url,'/api/admin/me');csrf=json.loads(b)['csrf']
            with self.assertRaises(urllib.error.HTTPError) as e:request(opener,url,'/api/admin/licenses',{'customer':'Wrong'})
            self.assertEqual(e.exception.code,403)
            status,b=request(opener,url,'/api/admin/licenses',{'customer':'Khách HTTP','days':30,'max_devices':1},{'X-Studio-CSRF':csrf});self.assertEqual(status,201);key=json.loads(b)['key']
            c=RemoteLicense(url,self.data/'customer',device='a'*64);self.assertTrue(c.activate(key)['ok'])
            web=self.data/'web';web.mkdir();(web/'index.html').write_text('<main>LOCAL-STUDIO</main>');(web/'assets').mkdir();(web/'assets/code.js').write_text('PRIVATE-APP')
            app=LocalApp(('127.0.0.1',0),c,web,'Owner Contact')
            with running(app) as local:
                local_opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
                with self.assertRaises(urllib.error.HTTPError):request(local_opener,local,'/assets/code.js')
                request(local_opener,local,'/?launch='+app.token)
                self.assertIn(b'LOCAL-STUDIO',request(local_opener,local,'/studio')[1])
                with self.assertRaises(urllib.error.HTTPError) as e:request(local_opener,local,'/assets/code.js',headers={'Origin':'https://evil.example'})
                self.assertEqual(e.exception.code,403)
                with self.assertRaises(urllib.error.HTTPError):request(local_opener,local,'/../licensing.py')
                self.store.update(self.store.list()[0]['id'],'toggle',{});c.deadline=0
                self.assertFalse(json.loads(request(local_opener,local,'/_desktop/status')[1])['ok'])
                with self.assertRaises(urllib.error.HTTPError) as e:request(local_opener,local,'/assets/code.js')
                self.assertEqual(e.exception.code,403)
    def test_exact_expiry_calendar_and_disabled_renewal(self):
        entry=self.store.create('Ngày cụ thể',expires_at='2023-12-01T23:59:00+07:00');device='a'*64
        self.store.update(entry['id'],'toggle',{});self.store.update(entry['id'],'extend',{'days':30})
        with self.assertRaisesRegex(LicenseError,'khóa'):self.store.check(entry['key'],device,'n'*30)
        self.store.update(entry['id'],'toggle',{});self.store.update(entry['id'],'expiry',{'expires_at':'2025-01-01T00:00:00+07:00'});self.assertEqual(self.store.list()[0]['expires_at'],'2024-12-31T17:00:00+00:00')

if __name__=='__main__':unittest.main(verbosity=2)
