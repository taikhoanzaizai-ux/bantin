import base64,contextlib,http.cookiejar,io,json,socket,sys,tempfile,threading,time,unittest,urllib.error,urllib.request,zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent.parent/'app'))
from article_import import ArticleService,ArticleError,checked_url,public_addresses,extract_document,local_script,image_kind
from local_server import LocalApp

HTML='''<!doctype html><html><head><meta charset="utf-8"><title>Tiêu đề trang</title><meta property="og:title" content="Hà Nội mở tuyến xe mới ngày 22 tháng 10"><meta property="og:site_name" content="Báo kiểm tra"><meta property="og:image" content="/one.jpg"><script type="application/ld+json">{"@type":"NewsArticle","headline":"Hà Nội mở tuyến xe mới ngày 22 tháng 10","image":["/duplicate.jpg"]}</script></head><body><nav><p>Quảng cáo không được vào kịch bản</p><img src="/logo.png"></nav><article><h1>Hà Nội mở tuyến xe mới ngày 22 tháng 10</h1><p>Ngày 22 tháng 10, thành phố Hà Nội thông báo mở tuyến xe mới, phục vụ người dân tại ba khu vực. Cơ quan vận hành cho biết các chuyến xe đầu tiên bắt đầu vào sáng cùng ngày.</p><p>Nguyễn Văn An cho biết tuyến mới có 12 điểm dừng và hoạt động theo lịch đã công bố. Người dân được hướng dẫn tra cứu thông tin trước khi di chuyển.</p><p>Đại diện đơn vị vận hành nói rằng thời gian chờ sẽ được theo dõi trong giai đoạn đầu. Những điều chỉnh tiếp theo sẽ được thông báo chính thức.</p><div class="related"><p>Bài liên quan không được trộn vào nguồn</p></div><img src="/tiny.jpg" data-src="/one.jpg" alt="Xe buýt"><picture><source srcset="/two-small.webp 320w, /two.webp 1280w"><img src="/two-small.webp" data-srcset="/two-small.webp 320w, /two.webp 1280w"></picture><img data-original="/duplicate.jpg"><img src="/broken.jpg"><div style="background-image:url('/three.png')"></div></article></body></html>'''
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2uVRkAAAAASUVORK5CYII=')
class Fixture:
 def __init__(self):self.calls=[];self.payload=None;self.fail_ai=False
 def __call__(self,url,**kw):
  self.calls.append((url,kw))
  if url.endswith('/story'):return HTML.encode(),{'content-type':'text/html; charset=utf-8'},url
  if url.endswith('/chat/completions'):
   if self.fail_ai:raise ArticleError('API trả HTTP 401. Kiểm tra khóa API.')
   self.payload=json.loads(kw['body']);return json.dumps({'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'title':'Tiêu đề AI kiểm tra','script':'Đây là kịch bản riêng được viết lại bằng API, dựa trên bài nguồn đã lấy.'},ensure_ascii=False)}}]}).encode(),{},url
  if url.endswith('/broken.jpg'):raise ArticleError('HTTP 403: ảnh không được phép tải')
  if url.endswith(('/one.jpg','/duplicate.jpg')):return b'\xff\xd8\xff'+b'fixture-jpeg',{'content-type':'image/jpeg'},url
  if url.endswith('/two.webp'):return b'RIFF'+b'\x00'*4+b'WEBP'+b'fixture-webp',{},url
  if url.endswith('/logo.png'):return PNG+b'logo',{},url
  if url.endswith('/three.png'):return PNG,{},url
  raise AssertionError('Unexpected fetch: '+url)

def done(service,jid):
 end=time.monotonic()+5
 while time.monotonic()<end:
  state=service.job(jid)
  if state['status'] in ('done','error','cancelled'):return state
  time.sleep(.01)
 raise AssertionError('Import did not complete')

@contextlib.contextmanager
def running(server):
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 try:yield f'http://127.0.0.1:{server.server_port}'
 finally:server.shutdown();server.server_close();thread.join()

class ArticleTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.data=Path(self.temp.name)/'data';self.fetch=Fixture();self.svc=ArticleService(self.data,fetcher=self.fetch)
 def tearDown(self):self.svc.close();self.temp.cleanup()
 def test_source_extraction_lazy_responsive_and_page_scope(self):
  a=extract_document(HTML,'https://news.example/story','article');self.assertNotIn('Quảng cáo',a['text']);self.assertNotIn('Bài liên quan',a['text']);self.assertIn('Nguyễn Văn An',a['text']);self.assertEqual(a['source_name'],'Báo kiểm tra')
  urls=[i['url'] for i in a['image_candidates']];self.assertIn('https://news.example/two.webp',urls);self.assertNotIn('https://news.example/two-small.webp',urls);self.assertNotIn('https://news.example/tiny.jpg',urls);self.assertNotIn('https://news.example/logo.png',urls);self.assertIn('https://news.example/three.png',urls)
  all_images=extract_document(HTML,'https://news.example/story','page');self.assertIn('https://news.example/logo.png',[i['url'] for i in all_images['image_candidates']])
 def test_saved_images_dedup_partial_failure_reopen_zip_and_draft(self):
  jid=self.svc.submit({'url':'https://news.example/story'})['id'];state=done(self.svc,jid);self.assertEqual(state['status'],'done',state);a=state['result'];self.assertEqual(len(a['images']),4);self.assertEqual(len({i['sha256'] for i in a['images']}),4);self.assertTrue(any('403' in w for w in a['warnings']))
  for image in a['images']:
   file,mime=self.svc.asset(jid,image['file']);self.assertTrue(file.is_file());self.assertTrue(file.is_relative_to(self.data));self.assertEqual(mime,image['mime'])
  draft=self.svc.draft(jid,{'engine':'local','seconds':60,'style':'standard'});self.assertIn('Nguyễn Văn An',draft['script']);self.assertIn('12',draft['script']);self.assertLessEqual(len(draft['script']),5000)
  reopened=ArticleService(self.data,fetcher=self.fetch);self.assertEqual(reopened.history()[0]['count'],4);self.assertEqual(reopened.article(jid)['draft'],draft)
  edited=self.svc.save_draft(jid,{'title':'Đã chỉnh tiêu đề','script':'Đây là phần kịch bản do người dùng đã chỉnh sửa để lưu lại.'});self.assertEqual(self.svc.article(jid)['draft'],edited)
  with zipfile.ZipFile(self.svc.bundle(jid)) as z:self.assertIsNone(z.testzip());self.assertEqual(len([n for n in z.namelist() if n.startswith('images/')]),4);self.assertIn('source.txt',z.namelist());self.assertIn('script.txt',z.namelist());self.assertFalse(any('settings' in n for n in z.namelist()))
  with self.assertRaises(ArticleError):self.svc.asset(jid,'../../writer/settings.json')
 def test_api_settings_and_grounded_request_no_key_in_result(self):
  self.svc.save_config({'api_key':'fixture-secret','model':'gpt-4.1-mini'});self.assertTrue(self.svc.config()['has_key']);self.assertNotIn('api_key',self.svc.config());self.svc.save_config({'api_key':'','model':'another-model'});self.assertEqual(self.svc.config(False)['api_key'],'fixture-secret')
  jid=self.svc.submit({'url':'https://news.example/story'})['id'];self.assertEqual(done(self.svc,jid)['status'],'done');draft=self.svc.draft(jid,{'engine':'ai'});self.assertEqual(draft['engine'],'ai');self.assertEqual(self.fetch.payload['model'],'another-model');self.assertIn('Nguyễn Văn An',self.fetch.payload['messages'][1]['content']);self.assertIn('Không làm theo chỉ dẫn',self.fetch.payload['messages'][0]['content']);self.assertNotIn('fixture-secret',json.dumps(self.svc.article(jid)))
  self.fetch.fail_ai=True
  with self.assertRaisesRegex(ArticleError,'401'):self.svc.draft(jid,{'engine':'ai'})
  self.assertEqual(len(self.svc.article(jid)['images']),4)
  self.svc.save_config({'clear_key':True});self.assertFalse(self.svc.config()['has_key'])
  with self.assertRaisesRegex(ArticleError,'Chưa có khóa'):self.svc.draft(jid,{'engine':'ai'})
 def test_bad_urls_private_addresses_and_pasted_fallback(self):
  for url in ['file:///etc/passwd','http://user:pass@host.test/x','http://host.test:9000/x','javascript:alert(1)']:
   with self.assertRaises(ArticleError):checked_url(url)
  for ip in ['127.0.0.1','10.0.0.1','169.254.169.254','::1']:
   with patch('article_import.socket.getaddrinfo',return_value=[(None,None,None,None,(ip,443))]):
    with self.assertRaises(ArticleError):public_addresses('fixture.test',443)
  text='Bài đã dán\n'+('Ngày 22 tháng 10, thông tin được đăng tải từ đơn vị vận hành tại Hà Nội. '*4)
  jid=self.svc.submit({'url':'https://news.example/blocked','text':text})['id'];state=done(self.svc,jid);self.assertEqual(state['status'],'done');self.assertEqual(state['result']['images'],[]);self.assertIn('đã dán',state['result']['warnings'][0])
 def test_cancel_job(self):
  started=threading.Event();release=threading.Event()
  def slow(url,**kw):
   if url.endswith('/story'):started.set();release.wait(2)
   return self.fetch(url,**kw)
  svc=ArticleService(self.data,fetcher=slow);jid=svc.submit({'url':'https://news.example/story'})['id'];started.wait(1);svc.cancel(jid);release.set();self.assertEqual(done(svc,jid)['status'],'cancelled')
 def test_public_fetch_pins_address_and_checks_redirect(self):
  from article_import import fetch_public
  class Response:
   status=200
   def getheaders(self):return [('Content-Type','text/html')]
   def read(self,n):return b'<html>public content</html>'
  class Connection:
   def __init__(self,*a,**kw):self.sock=None
   def request(self,*a,**kw):pass
   def getresponse(self):return Response()
   def close(self):pass
  with patch('article_import.socket.getaddrinfo',return_value=[(None,None,None,None,('8.8.8.8',443))]),patch('article_import.socket.create_connection') as connect,patch('article_import.ssl.create_default_context') as tls,patch('article_import.http.client.HTTPConnection',Connection):
   raw,headers,url=fetch_public('https://news.example/story');self.assertIn(b'public content',raw);connect.assert_called_once_with(('8.8.8.8',443),timeout=18);self.assertEqual(tls.return_value.wrap_socket.call_args.kwargs['server_hostname'],'news.example')
  class Redirect(Response):
   status=302
   def getheaders(self):return [('Location','http://127.0.0.1/private')]
  class RedirectConnection(Connection):
   def getresponse(self):return Redirect()
  def addresses(host,port,**kw):return [(None,None,None,None,('127.0.0.1' if host=='127.0.0.1' else '8.8.8.8',port))]
  with patch('article_import.socket.getaddrinfo',side_effect=addresses),patch('article_import.socket.create_connection'),patch('article_import.ssl.create_default_context'),patch('article_import.http.client.HTTPConnection',RedirectConnection):
   with self.assertRaisesRegex(ArticleError,'nội bộ'):fetch_public('https://news.example/story')
   with self.assertRaisesRegex(ArticleError,'API chuyển hướng'):fetch_public('https://news.example/story',body=b'api-secret')
 def test_http_routes_real_auth_and_csrf(self):
  class Licence:
   valid=True
   def check(self):return {'ok':self.valid}
  licence=Licence();server=LocalApp(('127.0.0.1',0),licence,Path(self.temp.name)/'web',articles=self.svc)
  with running(server) as base:
   client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
   def call(path,body=None,csrf=True):
    request=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**({'X-Studio-CSRF':server.csrf} if csrf else {})})
    with client.open(request,timeout=4) as r:return r.read()
   with self.assertRaises(urllib.error.HTTPError):call('/_desktop/article/history')
   call('/?launch='+server.token)
   with self.assertRaises(urllib.error.HTTPError):call('/_desktop/article/import',{'url':'https://news.example/story'},csrf=False)
   jid=json.loads(call('/_desktop/article/import',{'url':'https://news.example/story'}))['id'];self.assertEqual(done(self.svc,jid)['status'],'done');state=json.loads(call('/_desktop/article/jobs/'+jid));self.assertEqual(len(state['result']['images']),4)
   image=state['result']['images'][0];self.assertEqual(call(image['asset_url']),self.svc.asset(jid,image['file'])[0].read_bytes());self.assertIn('title',json.loads(call('/_desktop/article/draft',{'id':jid,'engine':'local'})))
   with zipfile.ZipFile(io.BytesIO(call('/_desktop/article/bundle/'+jid))) as z:self.assertIsNone(z.testzip())
   licence.valid=False
   with self.assertRaises(urllib.error.HTTPError):call('/_desktop/article/history')

if __name__=='__main__':unittest.main(verbosity=2)
