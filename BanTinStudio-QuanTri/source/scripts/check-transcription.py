import importlib.util,io,os,sys,wave,types
from pathlib import Path
from fastapi.testclient import TestClient
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'local-voice'))
os.environ['STUDIO_PAIRING_CODE']='transcription-test-only'
import transcription
calls=[]
class FakeWhisper:
 def transcribe(self,source,**kwargs):
  assert kwargs['language']=='vi' and kwargs['word_timestamps'] and kwargs['vad_filter']
  calls.append(kwargs)
  assert source.dtype.name=='float32' and len(source)==32000
  return iter([types.SimpleNamespace(words=[types.SimpleNamespace(word=' Xin',start=.5,end=.8),types.SimpleNamespace(word=' chào.',start=.8,end=1.1)])]),None
transcription.MODEL=FakeWhisper();transcription.MODEL_NAME='small'
def wav(seconds=2,rate=16000,channels=1,width=2):
 out=io.BytesIO()
 with wave.open(out,'wb') as f:
  f.setnchannels(channels);f.setsampwidth(width);f.setframerate(rate);f.writeframes(b'\0'*(int(seconds*rate)*channels*width))
 return out.getvalue()
result=transcription.transcribe_wav(wav());assert result['words'][0]=={'text':'Xin','start':.5,'end':.8}
try:transcription.transcribe_wav(wav(),'unapproved');raise AssertionError('invalid model accepted')
except ValueError:pass
for bad in [b'not-a-wav',wav(rate=8000),wav(channels=2),wav(width=1),wav(seconds=.05),wav(seconds=301),b'x'*10_000_001]:
 try:transcription.transcribe_wav(bad);raise AssertionError('invalid input accepted')
 except ValueError:pass
spec=importlib.util.spec_from_file_location('bridge_transcription_test',root/'local-voice/server.py');server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server);client=TestClient(server.app);headers={'Origin':server.SITE_ORIGIN,'Authorization':'Bearer transcription-test-only'}
health=client.get('/health',headers=headers).json();assert health['bridge_version']=='1.4' and 'transcribe' in health['capabilities'];assert server.MODEL is None
assert client.post('/v1/audio/transcribe',files={'file':('voice.wav',wav(),'audio/wav')}).status_code==401
assert client.post('/v1/audio/transcribe',headers={**headers,'Origin':'https://other.example'},files={'file':('voice.wav',wav(),'audio/wav')}).status_code==403
r=client.post('/v1/audio/transcribe',headers=headers,files={'file':('voice.wav',wav(),'audio/wav')});assert r.status_code==200 and len(r.json()['words'])==2;assert server.MODEL is None
assert client.post('/v1/audio/transcribe',headers=headers,files={'file':('invalid.wav',b'invalid','audio/wav')}).status_code==400
assert client.post('/v1/audio/transcribe',headers=headers,files={'file':('large.wav',b'x'*10_000_001,'audio/wav')}).status_code==400
assert len(calls)==2
print('Passed: actual WAV validation, word timestamp response, ASR model contract, independent health/captions without TTS model, pairing/origin boundary and endpoint input errors. Recognition model mocked in this suite.')
