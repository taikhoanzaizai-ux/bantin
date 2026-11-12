"""Real audio tempo test; TTS synthesis is replaced by a known sine waveform."""
import io,os,sys,wave,importlib.util
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'local-voice'))
from speech_speed import change_speech_speed
sr=48000
tone=(.3*np.sin(2*np.pi*440*np.arange(sr*2)/sr)).astype(np.float32)
assert change_speech_speed(tone,1) is tone
for speed in (.75,.8,1.25,1.5):
    result=change_speech_speed(tone,speed)
    assert len(result)==round(len(tone)/speed)
    assert np.isfinite(result).all()
    spectrum=np.abs(np.fft.rfft(result*np.hanning(len(result))))
    frequency=np.fft.rfftfreq(len(result),1/sr)[spectrum.argmax()]
    assert abs(frequency-440)<3,(speed,frequency)
for invalid in (0,.74,1.51,float('nan'),float('inf'),True):
    try:change_speech_speed(tone,invalid);raise AssertionError(invalid)
    except ValueError:pass
from fastapi.testclient import TestClient
os.environ['STUDIO_PAIRING_CODE']='test-speed-only'
spec=importlib.util.spec_from_file_location('speed_bridge',root/'local-voice/server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class Model:
    def list_preset_voices(self):return [('Nam Bắc','north')]
    def infer(self,text,voice):assert voice=='north';return tone
    def save(self,audio,path):
        with wave.open(path,'wb') as out:
            out.setnchannels(1);out.setsampwidth(2);out.setframerate(sr)
            out.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
server.MODEL=Model();client=TestClient(server.app)
headers={'Authorization':'Bearer test-speed-only','Origin':server.SITE_ORIGIN}
assert 'speech-speed' in client.get('/health',headers=headers).json()['capabilities']
for speed in (None,.8,1.25):
    body={'input':'Xin chào quý vị.','voice':'north'}
    if speed is not None:body['speed']=speed
    response=client.post('/v1/audio/speech',headers=headers,json=body)
    assert response.status_code==200,response.text
    with wave.open(io.BytesIO(response.content)) as audio:
        assert audio.getframerate()==sr
        assert audio.getnframes()==round(len(tone)/(speed or 1))
for speed in (.7,1.6,'bad'):
    assert client.post('/v1/audio/speech',headers=headers,json={'input':'Xin chào.','voice':'north','speed':speed}).status_code==422
print('PASS: real librosa tempo processing .75–1.5x changes duration as expected and keeps a synthetic 440 Hz tone; API output WAV contains adjusted frames and unchanged sample rate; invalid speed rejected and old requests default to 1x. VieNeu inference is mocked, human speech/Windows quality not assessed.')
