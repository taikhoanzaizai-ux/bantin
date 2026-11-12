from pathlib import Path
import importlib.util,os,sys,tempfile,types,unittest,subprocess
from unittest.mock import patch
from fastapi.testclient import TestClient
ROOT=Path(__file__).parent;sys.path.insert(0,str(ROOT/'local-voice'))
class Tests(unittest.TestCase):
 def test_preparation_auth_warm_both_models_once_and_restore_custom_voice(self):
  with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'STUDIO_PAIRING_CODE':'bridge-test-only','STUDIO_VOICE_DATA':folder,'STUDIO_MANAGED':'1','STUDIO_FIRST_PREPARE':'1'}):
   spec=importlib.util.spec_from_file_location('bridge_test',ROOT/'local-voice/server.py');server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
   class Fake:
    def __init__(self):self.voices={'north':'Nam miền Bắc'};self.probes=0;self.speaker_loads=0;self.engine=types.SimpleNamespace(_ensure_speaker_encoder=self.load_speaker)
    def load_speaker(self):self.speaker_loads+=1
    def list_preset_voices(self):return [(label,key) for key,label in self.voices.items()]
    def add_voice(self,name,path,denoise=True):self.voices[name]='Giọng riêng'
    def infer(self,*args,**kwargs):self.probes+=1;return b'samples'
   model=Fake();server.MODEL=model;client=TestClient(server.app);headers={'Authorization':'Bearer bridge-test-only','Origin':server.SITE_ORIGIN}
   self.assertEqual(client.post('/v1/prepare').status_code,401)
   import transcription,model_files
   calls=[]
   with patch.object(transcription,'warm_model',side_effect=lambda name:calls.append(name)):
    r=client.post('/v1/prepare',headers=headers,json={});self.assertEqual(r.status_code,200);self.assertEqual(calls,['base','small']);self.assertEqual(model.probes,1);self.assertEqual(model.speaker_loads,1)
    os.environ['STUDIO_FIRST_PREPARE']='0';client.post('/v1/prepare',headers=headers,json={});self.assertEqual(model.probes,1)
    os.environ['STUDIO_MANAGED']='0';self.assertEqual(client.post('/v1/prepare',headers=headers,json={}).status_code,403)
   (Path(folder)/'voice.json').write_text('{"name":"Giọng đã lưu"}');(Path(folder)/'voice.wav').write_bytes(b'wave');server.MODEL=None
   with patch.object(model_files,'install_model_copy_fix'),patch.dict(sys.modules,{'vieneu':types.SimpleNamespace(Vieneu=lambda **kw:Fake())}):
    restored=server.engine();self.assertIn('Giọng đã lưu',restored.voices)
 def test_managed_engine_exits_if_parent_is_gone(self):
  code="import sys,time;sys.path.insert(0,"+repr(str(ROOT/'local-voice'))+");import server;server.watch_parent();time.sleep(3);print('STILL-RUNNING')"
  r=subprocess.run([sys.executable,'-c',code],capture_output=True,text=True,env={**os.environ,'STUDIO_PARENT_PID':'1'},timeout=6)
  self.assertEqual(r.returncode,0);self.assertNotIn('STILL-RUNNING',r.stdout)
 def test_transcription_switch_does_not_reload_same_model(self):
  import transcription
  calls=[]
  class FakeWhisper:
   def __init__(self,name,**kw):calls.append(name)
  transcription.MODEL=None;transcription.MODEL_NAME=None
  with patch.dict(sys.modules,{'faster_whisper':types.SimpleNamespace(WhisperModel=FakeWhisper)}):
   a=transcription.warm_model('base');self.assertIs(transcription.warm_model('base'),a);transcription.warm_model('small');self.assertEqual(calls,['base','small'])
if __name__=='__main__':unittest.main(verbosity=2)
