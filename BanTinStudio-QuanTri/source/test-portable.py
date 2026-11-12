from pathlib import Path
import contextlib,http.cookiejar,json,os,shutil,sqlite3,struct,subprocess,sys,tempfile,threading,time,unittest,urllib.error,urllib.request
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent;sys.path.insert(0,str(ROOT/'app'))
from portable import storage,environment,browser_command,migrate_client,migrate_licenses
from voice_manager import VoiceManager,write_json
from local_server import LocalApp,window_idle

class PortableTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.folder=Path(self.temp.name)
        self.root=self.folder/'D drive'/'Quân Bản Tin';self.root.mkdir(parents=True)
        self.old=self.folder/'C drive'/'AppData';self.old.mkdir(parents=True)
        self.patch=patch.dict(os.environ,{'LOCALAPPDATA':str(self.old),'HF_HOME':str(self.folder/'old-hf')});self.patch.start()
    def tearDown(self):self.patch.stop();self.temp.cleanup()
    def manager(self):
        kit=self.root/'local-voice';kit.mkdir(exist_ok=True);(kit/'requirements.txt').write_text('vieneu==3.8.3\n')
        return VoiceManager(self.root)
    def test_all_cache_install_and_browser_paths_stay_beside_unicode_exe(self):
        base={'HF_HOME':'C:/cache','HF_HUB_CACHE':'C:/hub','TEMP':'C:/temp','PIP_TARGET':'C:/packages','PYTHONHOME':'C:/python','PYTHONPATH':'C:/modules','SOME_UNRELATED':'keep'}
        env=environment(self.root,base)
        for key in ['HF_HOME','HF_HUB_CACHE','HUGGINGFACE_HUB_CACHE','HF_XET_CACHE','HF_ASSETS_CACHE','TRANSFORMERS_CACHE','TORCH_HOME','MODELSCOPE_CACHE','NUMBA_CACHE_DIR','MPLCONFIGDIR','PIP_CACHE_DIR','XDG_CACHE_HOME','TEMP','TMP','TMPDIR']:
            self.assertTrue(Path(env[key]).is_relative_to(self.root/'data'),key);self.assertTrue(Path(env[key]).is_dir())
        self.assertNotIn('PIP_TARGET',env);self.assertNotIn('PYTHONHOME',env);self.assertNotIn('PYTHONPATH',env);self.assertEqual(env['SOME_UNRELATED'],'keep');self.assertEqual(base['HF_HOME'],'C:/cache')
        args=browser_command('C:/Program Files/Chrome/chrome.exe','http://127.0.0.1:8787/?launch=test',self.root)
        self.assertIn('--user-data-dir='+str(self.root/'data/browser'),args);self.assertIn('--disk-cache-dir='+str(self.root/'data/browser-cache'),args);self.assertTrue(args[-1].startswith('--app='))
        m=self.manager();self.assertEqual(m.data,self.root/'data/ai')
        with patch('voice_manager.subprocess.Popen') as spawn:
            spawn.return_value.wait.return_value=0;m.command([sys.executable,'-c','pass'])
        self.assertTrue(Path(spawn.call_args.kwargs['env']['TEMP']).is_relative_to(self.root))
    def test_python_detection_decodes_unicode_paths_in_utf8(self):
        m=self.manager()
        with patch('voice_manager.shutil.which',return_value=sys.executable),patch('voice_manager.subprocess.run') as run:
            run.return_value.returncode=0;run.return_value.stdout=str(self.root/'Python 3.11/python.exe')+'\n'
            self.assertEqual(m.detect_python(),[str(self.root/'Python 3.11/python.exe')])
            self.assertEqual(run.call_args.kwargs['encoding'],'utf-8');self.assertEqual(run.call_args.kwargs['env']['PYTHONIOENCODING'],'utf-8')
    def test_migration_copies_only_tool_bytes_and_never_reuses_C_venv(self):
        old=self.old/'BanTinStudioAI';(old/'my-voices').mkdir(parents=True);(old/'my-voices/Quân.wav').write_bytes(b'VOICE');(old/'my-voices/Quân.json').write_text('{}');(old/'my-voices/unrelated.exe').write_bytes(b'NO')
        (old/'models-local').mkdir();(old/'models-local/model.data').write_bytes(b'TENSORS')
        hub=Path(os.environ['HF_HOME'])/'hub';repo=hub/'models--pnnbao-ump--VieNeu-TTS';(repo/'blobs').mkdir(parents=True);(repo/'blobs/abc').write_bytes(b'WEIGHTS');(repo/'snapshots/version').mkdir(parents=True);(repo/'snapshots/version/model.onnx').symlink_to('../../blobs/abc')
        other=hub/'models--other--unrelated';other.mkdir();(other/'huge.bin').write_bytes(b'UNRELATED')
        m=self.manager();write_json(m.manifest,{'requirements':m.signature,'python':str(old/'.venv/Scripts/python.exe')})
        m.migrate();self.assertEqual((m.data/'my-voices/Quân.wav').read_bytes(),b'VOICE');self.assertFalse((m.data/'my-voices/unrelated.exe').exists());self.assertEqual((m.data/'models-local/model.data').read_bytes(),b'TENSORS')
        copied=m.data/'cache/huggingface/hub'/repo.name/'snapshots/version/model.onnx';self.assertEqual(copied.read_bytes(),b'WEIGHTS');self.assertFalse(copied.is_symlink());self.assertFalse((m.data/'cache/huggingface/hub'/other.name).exists())
        with patch.object(m,'probe',return_value=False) as probe:self.assertIsNone(m.runtime(False))
        self.assertTrue(all(Path(call.args[0]).is_relative_to(m.data) for call in probe.call_args_list))
        self.assertEqual((old/'my-voices/Quân.wav').read_bytes(),b'VOICE');self.assertEqual((repo/'blobs/abc').read_bytes(),b'WEIGHTS')
    def test_relative_runtime_survives_move_without_reinstall(self):
        m=self.manager();python=m.python_path(m.data/'.venv');python.parent.mkdir(parents=True);python.write_bytes(b'PYTHON');write_json(m.manifest,{'requirements':m.signature,'python':str(python.relative_to(m.data))})
        moved=self.folder/'E drive'/'Quân mới';moved.parent.mkdir();shutil.move(self.root,moved);after=VoiceManager(moved)
        with patch.object(after,'probe',side_effect=lambda p:Path(p).is_file()),patch.object(after,'command',side_effect=AssertionError('Unexpected install')):
            self.assertEqual(after.runtime(False),after.python_path(after.data/'.venv'))
        self.assertTrue(Path(after.environment(True)['HF_HOME']).is_relative_to(moved))
    def test_client_key_and_sqlite_WAL_migrate_without_overwrite(self):
        old=self.old/'BanTinStudio';old.mkdir();(old/'activation.json').write_text('{"key":"test"}');(old/'desktop-session.json').write_text('NO')
        data=storage(self.root)/'client';migrate_client(data);self.assertEqual(json.loads((data/'activation.json').read_text())['key'],'test');self.assertFalse((data/'desktop-session.json').exists())
        (data/'activation.json').write_text('KEEP');migrate_client(data);self.assertEqual((data/'activation.json').read_text(),'KEEP')
        server=self.old/'BanTinLicenseServer';server.mkdir();con=sqlite3.connect(server/'licenses.sqlite3');con.execute('PRAGMA journal_mode=WAL');con.execute('CREATE TABLE codes(value TEXT)');con.execute('INSERT INTO codes VALUES (?)',('saved-key',));con.commit()
        (server/'admin-auth.json').write_text('{"hash":"auth"}');(server/'settings.json').write_text('{"contact":"Quân"}');target=storage(self.root)/'license-server'
        try:
            migrate_licenses(target)
            with sqlite3.connect(target/'licenses.sqlite3') as copied:self.assertEqual(copied.execute('SELECT value FROM codes').fetchone()[0],'saved-key')
            self.assertEqual((target/'admin-auth.json').read_text(),'{"hash":"auth"}')
            con.execute('INSERT INTO codes VALUES (?)',('new-old-data',));con.commit();migrate_licenses(target)
            with sqlite3.connect(target/'licenses.sqlite3') as copied:self.assertEqual(copied.execute('SELECT count(*) FROM codes').fetchone()[0],1)
        finally:con.close()
    def test_quit_is_authenticated_and_stops_server_and_voice(self):
        class License:
            def check(self):return {'ok':True,'owner':True}
        class Voice:
            thread=None
            closed=False
            def close(self):self.closed=True
        voice=Voice();server=LocalApp(('127.0.0.1',0),License(),self.root,voice=voice);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}'
        client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def request(path,data=None,headers=None):return client.open(urllib.request.Request(base+path,data=data,headers=headers or {}),timeout=5)
        try:
            with self.assertRaises(urllib.error.HTTPError):request('/_desktop/quit',b'')
            request('/?launch='+server.token).close()
            with request('/_desktop/status') as response:state=json.load(response)
            self.assertEqual(state['csrf'],server.csrf)
            with self.assertRaises(urllib.error.HTTPError):request('/_desktop/quit',b'',{'X-Studio-CSRF':'bad'})
            self.assertFalse(window_idle(server,server.last_seen+179));self.assertTrue(window_idle(server,server.last_seen+181));server.pending=1;self.assertFalse(window_idle(server,server.last_seen+200));server.pending=0
            with request('/_desktop/quit',b'',{'X-Studio-CSRF':server.csrf}) as response:self.assertTrue(json.load(response)['ok'])
            thread.join(3);self.assertFalse(thread.is_alive())
        finally:server.shutdown();server.server_close();thread.join()
        self.assertTrue(voice.closed)

if __name__=='__main__':unittest.main(verbosity=2)
