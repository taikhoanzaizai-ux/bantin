from pathlib import Path
import contextlib,http.cookiejar,json,os,sys,tempfile,threading,time,unittest,urllib.error,urllib.request
from unittest.mock import patch
ROOT=Path(__file__).parent;sys.path.insert(0,str(ROOT/'app'))
from voice_manager import VoiceManager,installation_lock,write_json,read_json
from local_server import LocalApp,reopen_existing
FAKE=r'''
import json,os
from pathlib import Path
from http.server import BaseHTTPRequestHandler,HTTPServer
root=Path(os.environ['STUDIO_VOICE_DATA']).parent
(root/'fake-environment.json').write_text(json.dumps({'offline':os.environ.get('HF_HUB_OFFLINE','0'),'prefer_cache':os.environ.get('STUDIO_PREFER_CACHE'),'models':os.environ['STUDIO_MODEL_DIR'],'voices':os.environ['STUDIO_VOICE_DATA']}))
VOICES=[{'id':'north','name':'North','description':'Nam Bắc'}]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def send(self,body):
  b=json.dumps(body).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def auth(self):
  if self.headers.get('Authorization')!='Bearer '+os.environ['STUDIO_PAIRING_CODE']:self.send_error(401);return False
  return True
 def do_GET(self):
  if not self.auth():return
  if self.path=='/health':self.send({'protocol':'ban-tin-local-v1','capabilities':['tts','transcribe']})
  elif self.path=='/v1/voices':self.send({'data':VOICES})
  else:self.send_error(404)
 def do_POST(self):
  if not self.auth():return
  self.rfile.read(int(self.headers.get('Content-Length','0')))
  if self.path=='/v1/prepare':
   target=Path(os.environ['STUDIO_MODEL_DIR'])/'cached.bin';target.parent.mkdir(parents=True,exist_ok=True)
   if os.environ.get('HF_HUB_OFFLINE')=='1' and not target.exists():self.send_error(503);return
   if not target.exists():target.write_bytes(b'MODEL-CACHE')
   self.send({'data':[{'id':'north','name':'North','description':'Nam Bắc'}]})
  elif self.path=='/v1/voices':
   VOICES.append({'id':'saved','name':'Saved voice','description':'Giọng riêng'});self.send({'id':'saved'})
  elif self.path=='/v1/audio/speech':self.send({'synthesized':True})
  else:self.send_error(404)
HTTPServer(('127.0.0.1',int(os.environ['STUDIO_VOICE_PORT'])),Handler).serve_forever()
'''
def wait(manager):
 deadline=time.monotonic()+10
 while manager.thread and manager.thread.is_alive():
  manager.thread.join(.05)
  if time.monotonic()>deadline:raise AssertionError('Worker did not finish: '+str(manager.status()))
 return manager.status()
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.app=self.root/'tool';self.kit=self.app/'local-voice';self.kit.mkdir(parents=True);(self.kit/'requirements.txt').write_text('vieneu==3.8.3\n');(self.kit/'server.py').write_text(FAKE);self.data=self.root/'persistent';self.managers=[]
 def tearDown(self):
  for m in self.managers:m.close()
  self.tmp.cleanup()
 def manager(self):
  m=VoiceManager(self.app,self.data);self.managers.append(m);return m
 def test_first_setup_then_automatic_restart_prefers_same_cache_without_reinstall(self):
  m=self.manager()
  with patch.object(m,'runtime',return_value=Path(sys.executable)),patch.object(m,'command',side_effect=AssertionError('Unexpected reinstall')):
   m.ensure(setup=True);self.assertTrue(wait(m)['ready'])
   self.assertEqual(read_json(self.data/'fake-environment.json')['offline'],'0')
   cache=self.data/'models-local/cached.bin';before=cache.stat().st_mtime_ns;first_token=m.token;m.close()
   second=self.manager()
   with patch.object(second,'runtime',return_value=Path(sys.executable)),patch.object(second,'command',side_effect=AssertionError('Unexpected reinstall')):
    second.ensure();self.assertTrue(wait(second)['ready']);self.assertEqual(read_json(self.data/'fake-environment.json')['prefer_cache'],'1');self.assertEqual(cache.stat().st_mtime_ns,before);self.assertNotEqual(first_token,second.token)
    self.assertEqual(second.proxy('/v1/voices')[0],200);second.proxy('/v1/voices',b'form','multipart/form-data');self.assertTrue(any(v['id']=='saved' for v in second.status()['voices']))
 def test_migration_keeps_custom_voices_and_does_not_overwrite_existing(self):
  (self.kit/'my-voices').mkdir();(self.kit/'my-voices/old.wav').write_bytes(b'VOICE');(self.kit/'my-voices/old.json').write_text('{"name":"Giọng riêng"}');(self.kit/'my-voices/skip.exe').write_bytes(b'NO')
  (self.kit/'models-local').mkdir();(self.kit/'models-local/old.bin').write_bytes(b'OLD-MODEL');m=self.manager();m.migrate();self.assertEqual((self.data/'my-voices/old.wav').read_bytes(),b'VOICE');self.assertFalse((self.data/'my-voices/skip.exe').exists());(self.data/'my-voices/old.wav').write_bytes(b'NEW');m.migrate();self.assertEqual((self.data/'my-voices/old.wav').read_bytes(),b'NEW');self.assertEqual((self.data/'models-local/old.bin').read_bytes(),b'OLD-MODEL')
 def test_no_install_without_first_setup_and_no_repeated_probe(self):
  m=self.manager()
  with patch.object(m,'runtime',return_value=None) as runtime:
   m.ensure();self.assertEqual(wait(m)['phase'],'needs_setup');m.ensure();self.assertEqual(runtime.call_count,1)
 def test_update_requires_explicit_setup_and_preserves_existing_data(self):
  m=self.manager();write_json(m.manifest,{'requirements':'OLD','python':sys.executable});voice=self.data/'my-voices/saved.wav';voice.parent.mkdir();voice.write_bytes(b'KEEP')
  with patch.object(m,'runtime',return_value=Path(sys.executable)) as runtime:
   m.ensure();self.assertEqual(wait(m)['phase'],'needs_update');self.assertEqual(runtime.call_count,0)
   m.ensure(setup=True);self.assertTrue(wait(m)['ready']);self.assertEqual(runtime.call_args.args,(True,));self.assertEqual(voice.read_bytes(),b'KEEP');self.assertEqual(read_json(m.prepared)['requirements'],m.signature)
 def test_existing_port_reports_bind_error_and_closes_only_new_manager(self):
  class License:
   def check(self):return {'ok':True}
  web=self.root/'web';web.mkdir();first=LocalApp(('127.0.0.1',0),License(),web)
  try:
   voice=self.manager()
   with patch.object(voice,'close') as close:
    with self.assertRaises(OSError):LocalApp(('127.0.0.1',first.server_port),License(),web,voice=voice)
    self.assertEqual(close.call_count,1)
  finally:first.server_close()
 def test_reopening_existing_window_reuses_authenticated_local_process(self):
  class License:
   def check(self):return {'ok':True}
  web=self.root/'web';web.mkdir();server=LocalApp(('127.0.0.1',0),License(),web);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();port=server.server_port;write_json(self.data/'desktop-session.json',{'port':port,'token':server.token})
  try:
   with patch('local_server.open_browser') as open_window:
    self.assertTrue(reopen_existing(self.data,port));self.assertEqual(open_window.call_count,1)
    write_json(self.data/'desktop-session.json',{'port':port,'token':'wrong'});self.assertFalse(reopen_existing(self.data,port));self.assertEqual(open_window.call_count,1)
  finally:server.shutdown();server.server_close();thread.join()
 def test_installation_lock_serializes_two_threads(self):
  running=[0];maximum=[0]
  def job():
   with installation_lock(self.data):running[0]+=1;maximum[0]=max(maximum[0],running[0]);time.sleep(.05);running[0]-=1
  a=threading.Thread(target=job);b=threading.Thread(target=job);a.start();b.start();a.join();b.join();self.assertEqual(maximum[0],1)
 def test_proxy_auth_csrf_and_licence_gate(self):
  class License:
   ok=True
   def check(self):return {'ok':self.ok}
  m=self.manager();license=License();web=self.root/'web';web.mkdir();(web/'index.html').write_text('app')
  with patch.object(m,'runtime',return_value=Path(sys.executable)):
   m.ensure(True);self.assertTrue(wait(m)['ready']);server=LocalApp(('127.0.0.1',0),license,web,voice=m);t=threading.Thread(target=server.serve_forever,daemon=True);t.start();base=f'http://127.0.0.1:{server.server_port}';client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
   def req(path,data=None,headers=None):return client.open(urllib.request.Request(base+path,data=data,headers=headers or {}),timeout=5)
   try:
    with self.assertRaises(urllib.error.HTTPError):req('/_desktop/voice/status')
    req('/?launch='+server.token).close()
    with req('/_desktop/voice/status') as r:state=json.load(r)
    self.assertTrue(state['ready']);self.assertNotIn(m.token,json.dumps(state));self.assertNotIn('token',state)
    with self.assertRaises(urllib.error.HTTPError) as e:req('/_desktop/voice/proxy/v1/audio/speech',b'{}',{'Content-Type':'application/json'})
    self.assertEqual(e.exception.code,403)
    with req('/_desktop/voice/proxy/v1/audio/speech',b'{}',{'Content-Type':'application/json','X-Studio-CSRF':state['csrf']}) as r:self.assertTrue(json.load(r)['synthesized'])
    with self.assertRaises(urllib.error.HTTPError):req('/_desktop/voice/proxy/unknown')
    license.ok=False
    with self.assertRaises(urllib.error.HTTPError) as e:req('/_desktop/voice/status')
    self.assertEqual(e.exception.code,403)
   finally:server.shutdown();server.server_close();t.join()
if __name__=='__main__':unittest.main(verbosity=2)
