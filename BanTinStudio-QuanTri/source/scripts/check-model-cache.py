"""Exercise the real filesystem adapter with a simulated Hub and no model weights."""
from pathlib import Path
import sys,tempfile,types
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'local-voice'))
from model_files import install_model_copy_fix
class Engine:pass
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory);cache=root/'cache';cache.mkdir()
    (cache/'graph-blob').write_bytes(b'ONNX-GRAPH')
    (cache/'tensor-blob').write_bytes(b'EXTERNAL-TENSORS')
    objects={'model.onnx':cache/'graph-blob','shared.data':cache/'tensor-blob'}
    calls=[]
    def download(repo,filename,**kwargs):
        calls.append((filename,kwargs.get('local_files_only',False)))
        return objects[filename]
    stubs={'huggingface_hub':types.SimpleNamespace(hf_hub_download=download),'vieneu._v3_turbo_engine.onnx_runtime_lite':types.SimpleNamespace(OnnxV3LiteEngine=Engine)}
    with patch.dict(sys.modules,stubs):
        install_model_copy_fix(root/'models')
        bundle=Engine._fetch('repo',['model.onnx','shared.data'],None)
        assert (bundle/'model.onnx').read_bytes()==b'ONNX-GRAPH'
        assert (bundle/'shared.data').read_bytes()==b'EXTERNAL-TENSORS'
        assert not (bundle/'model.onnx').is_symlink()
        assert calls==[('model.onnx',True),('shared.data',True)]
        before=(bundle/'shared.data').stat().st_mtime_ns
        Engine._fetch('repo',['model.onnx','shared.data'],None)
        assert (bundle/'shared.data').stat().st_mtime_ns==before
        assert (cache/'tensor-blob').read_bytes()==b'EXTERNAL-TENSORS'
    calls.clear()
    def missing_cache(repo,filename,**kwargs):
        calls.append(kwargs.get('local_files_only',False))
        if kwargs.get('local_files_only'):raise FileNotFoundError('not cached yet')
        return cache/'graph-blob'
    with patch.dict(sys.modules,{**stubs,'huggingface_hub':types.SimpleNamespace(hf_hub_download=missing_cache)}):
        install_model_copy_fix(root/'fresh-models')
        assert Engine._fetch('repo',['model.onnx'],None).joinpath('model.onnx').is_file()
        assert calls==[True,False]
print('PASS: ONNX graph/external tensor siblings are real local files; cached bytes cause no online request or recopy; only a missing cached file falls back to the Hub; shared cache stays unchanged. Hub/ORT inference are simulated.')
