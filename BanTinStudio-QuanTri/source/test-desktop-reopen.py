import contextlib,http.cookiejar,json,sys,tempfile,threading,unittest,urllib.error,urllib.request
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).parent.parent/'app'))
from local_server import LocalApp,reopen_existing
from desktop_session import desktop_lock,launch_secret
from voice_manager import write_json
class Licence:
 def check(self):return {'ok':True,'owner':True}
@contextlib.contextmanager
def serving(server):
 t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
 try:yield f'http://127.0.0.1:{server.server_port}'
 finally:server.shutdown();server.server_close();t.join()
def browser(jar=None):return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar if jar is not None else http.cookiejar.CookieJar()))
class ReopenTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.web=self.root/'web';self.web.mkdir();(self.web/'index.html').write_text('STUDIO');self.data=self.root/'data/owner';self.data.mkdir(parents=True)
 def tearDown(self):self.tmp.cleanup()
 def test_bootstrap_survives_three_shutdown_restart_cycles(self):
  with desktop_lock(self.data) as got:self.assertTrue(got);secret=launch_secret(self.data)
  jar=http.cookiejar.CookieJar();client=browser(jar);tokens=[];port=0
  for _ in range(3):
   with desktop_lock(self.data) as got:self.assertTrue(got);self.assertEqual(launch_secret(self.data),secret)
   app=LocalApp(('127.0.0.1',port),Licence(),self.web,launch_key=secret);port=app.server_port;tokens.append(app.token)
   with serving(app) as base:
    with client.open(base+'/?launch='+secret) as r:self.assertEqual(r.status,200)
    with client.open(base+'/studio') as r:self.assertEqual(r.read(),b'STUDIO')
    with client.open(base+'/_desktop/status') as r:self.assertIn('csrf',json.load(r))
    self.assertNotIn(secret,[c.value for c in jar]);self.assertIn(app.cookie_name,[c.name for c in jar])
  self.assertEqual(len(set(tokens)),3)
 def test_reopen_uses_authenticated_existing_server_without_new_bind(self):
  secret=launch_secret(self.data);app=LocalApp(('127.0.0.1',0),Licence(),self.web,launch_key=secret)
  with serving(app):
   write_json(self.data/'desktop-session.json',{'port':app.server_port,'token':app.token,'launch_key':secret})
   with patch('local_server.open_browser') as opened:
    for _ in range(3):self.assertTrue(reopen_existing(self.data,app.server_port,root=self.root))
    self.assertEqual(opened.call_count,3);self.assertTrue(opened.call_args.args[0].endswith('?launch='+secret));self.assertEqual(opened.call_args.kwargs['root'],self.root)
   with self.assertRaises(OSError):LocalApp(('127.0.0.1',app.server_port),Licence(),self.web)
 def test_two_ports_do_not_overwrite_each_others_cookies(self):
  jar=http.cookiejar.CookieJar();client=browser(jar);a=LocalApp(('127.0.0.1',0),Licence(),self.web);b=LocalApp(('127.0.0.1',0),Licence(),self.web)
  with serving(a) as first,serving(b) as second:
   client.open(first+'/?launch='+a.token).close();client.open(second+'/?launch='+b.token).close()
   for base in [first,second]:
    with client.open(base+'/_desktop/status') as r:self.assertTrue(json.load(r)['ok'])
   self.assertEqual(len(jar),2)
 def test_invalid_url_never_authenticates_but_gets_recovery_instructions(self):
  app=LocalApp(('127.0.0.1',0),Licence(),self.web)
  with serving(app) as base:
   with self.assertRaises(urllib.error.HTTPError) as error:browser().open(base+'/?launch=old-token')
   self.assertEqual(error.exception.code,401);self.assertIn('Phiên kết nối đã cũ',error.exception.read().decode())
   with self.assertRaises(urllib.error.HTTPError):browser().open(base+'/_desktop/article/settings')
 def test_instance_lock_is_released_after_owner_closes(self):
  with desktop_lock(self.data) as first:
   self.assertTrue(first)
   with desktop_lock(self.data) as second:self.assertFalse(second)
  with desktop_lock(self.data) as third:self.assertTrue(third)
 def test_windows_exclusive_socket_option_is_set_before_bind(self):
  fake=Mock();fake.socket=Mock();fake.allow_reuse_address=True
  with patch('local_server.os.name','nt'),patch('local_server.socket.SO_EXCLUSIVEADDRUSE',123,create=True),patch('http.server.ThreadingHTTPServer.server_bind'):
   # Call using an actual subclass object so super() resolves normally.
   app=LocalApp.__new__(LocalApp);app.socket=fake.socket;app.allow_reuse_address=True
   LocalApp.server_bind(app)
   self.assertFalse(app.allow_reuse_address);self.assertEqual(fake.socket.setsockopt.call_args.args[1:],(123,1))
if __name__=='__main__':unittest.main(verbosity=2)
