import importlib.util, io, json, os, sys, tempfile, wave
from pathlib import Path
from fastapi.testclient import TestClient
root=Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root/'local-voice'))
with tempfile.TemporaryDirectory() as directory:
 os.environ['STUDIO_PAIRING_CODE']='unit-test-pairing-only'
 os.environ['STUDIO_VOICE_DATA']=directory
 spec=importlib.util.spec_from_file_location('local_voice',root/'local-voice/server.py')
 server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
 class FakeModel:
  def __init__(self):self.voices={'Minh Đức':'Nam Bắc — test fixture'};self.calls=0
  def list_preset_voices(self):return [(description,name) for name,description in self.voices.items()]
  def add_voice(self,name,path,denoise=True):
   assert Path(path).exists();self.voices[name]='Giọng riêng'
  def infer(self,text,voice):assert voice in self.voices;self.calls+=1;return text
  def save(self,audio,path):Path(path).write_bytes(wav())
 def wav(seconds=3):
  b=io.BytesIO()
  with wave.open(b,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*16000*seconds)
  return b.getvalue()
 server.MODEL=FakeModel();client=TestClient(server.app)
 headers={'Origin':server.SITE_ORIGIN,'Authorization':'Bearer unit-test-pairing-only'}
 assert client.get('/health').status_code==401
 assert client.get('/health',headers={**headers,'Origin':'https://other.example'}).status_code==403
 preflight=client.options('/v1/voices',headers={'Origin':server.SITE_ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization','Access-Control-Request-Private-Network':'true'})
 assert preflight.status_code==200
 assert preflight.headers['access-control-allow-private-network']=='true'
 assert preflight.headers['access-control-allow-origin']==server.SITE_ORIGIN
 assert client.get('/health',headers=headers).json()['protocol']=='ban-tin-local-v1'
 assert client.get('/v1/voices',headers=headers).json()['data'][0]['id']=='Minh Đức'
 def enroll(consent='yes',sample=None,name='Giọng của Quân'):
  return client.post('/v1/voices',headers=headers,data={'name':name,'consent':consent},files={'file':('sample.wav',wav() if sample is None else sample,'audio/wav')})
 assert enroll(consent='no').status_code==400
 assert enroll(sample=b'not audio').status_code==400
 assert enroll(sample=wav(9)).status_code==400
 assert enroll(name='../bad').status_code==400
 result=enroll();assert result.status_code==200,result.text
 assert result.json()['id']=='Giọng của Quân'
 assert len(list(Path(directory).glob('*.wav')))==1
 assert len(list(Path(directory).glob('*.json')))==1
 assert enroll().status_code==409
 assert client.post('/v1/audio/speech',headers=headers,json={'input':'Kịch bản bản tin.','voice':'unknown'}).status_code==404
 generated=client.post('/v1/audio/speech',headers=headers,json={'input':'Kịch bản bản tin.','voice':'Giọng của Quân'})
 assert generated.status_code==200 and generated.content[:4]==b'RIFF'
 assert server.MODEL.calls==1
 assert client.post('/v1/audio/speech',headers=headers,json={'input':'x'*5001,'voice':'Minh Đức'}).status_code==422
 def broken_loader(_):
  raise RuntimeError('External data path escapes model directory')
 import types
 previous=sys.modules.get('model_files')
 sys.modules['model_files']=types.SimpleNamespace(install_model_copy_fix=broken_loader)
 server.MODEL=None
 try:
  failed=client.get('/v1/voices',headers=headers)
  assert failed.status_code==503
  assert 'model_files.py' in failed.json()['detail']
  assert failed.headers['access-control-allow-origin']==server.SITE_ORIGIN
 finally:
  if previous is None:sys.modules.pop('model_files',None)
  else:sys.modules['model_files']=previous
 print('Passed: local pairing, origin boundary, CORS/private-network preflight, live voice listing, WAV upload constraints, sample persistence, duplicate protection and speech response. VieNeu inference mocked; no model weights loaded.')
