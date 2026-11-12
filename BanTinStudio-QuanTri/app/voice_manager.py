"""Own a local VieNeu process and keep its installation/data across application updates."""
from __future__ import annotations
import contextlib,hashlib,json,os,re,secrets,shutil,socket,subprocess,threading,time,urllib.error,urllib.request
from pathlib import Path
from portable import storage,environment as portable_environment,copy_missing

class VoiceError(Exception):pass

def default_data(root=None):return storage(root or Path(__file__).resolve().parent.parent)/'ai'
def read_json(path,fallback=None):
    try:return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError,ValueError):return {} if fallback is None else fallback
def write_json(path,value):
    p=Path(path);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8');tmp.replace(p)

@contextlib.contextmanager
def installation_lock(root):
    p=Path(root)/'install.lock';p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('a+b') as f:
        f.seek(0,2)
        if f.tell()==0:f.write(b'0');f.flush()
        deadline=time.monotonic()+1800
        while True:
            f.seek(0)
            try:
                if os.name=='nt':
                    import msvcrt
                    msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
                else:
                    import fcntl
                    fcntl.flock(f.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic()>deadline:raise VoiceError('Một phiên khác đang chuẩn bị VieNeu quá lâu. Đóng phiên đó rồi thử lại.')
                time.sleep(.5)
        try:yield
        finally:
            f.seek(0)
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1)
            else:
                import fcntl
                fcntl.flock(f.fileno(),fcntl.LOCK_UN)

class VoiceManager:
    def __init__(self,root,data=None,origin='http://127.0.0.1:8787'):
        self.root=Path(root).resolve();self.kit=self.root/'local-voice';self.data=Path(data or default_data(self.root)).resolve();self.data.mkdir(parents=True,exist_ok=True)
        self.origin=origin;self.lock=threading.RLock();self.phase='idle';self.message='VieNeu sẽ tự kết nối nếu đã chuẩn bị.';self.error='';self.process=None;self.closing=False;self.thread=None;self.port=None;self.token=None;self.voices=[]
        self.signature=hashlib.sha256((self.kit/'requirements.txt').read_bytes()).hexdigest();self.sdk_version=re.search(r'^vieneu==([^\s]+)',(self.kit/'requirements.txt').read_text(),re.M).group(1);self.manifest=self.data/'installed.json';self.prepared=self.data/'prepared.json';self.log=self.data/'vieneu.log'
    def status(self):
        with self.lock:
            if self.phase=='ready' and (not self.process or self.process.poll() is not None):self.phase='idle';self.message='Bộ chạy đã dừng; đang chờ khởi động lại.'
            return {'phase':self.phase,'ready':self.phase=='ready','message':self.message,'error':self.error,'voices':list(self.voices),'data_dir':str(self.data),'needs_update':bool(read_json(self.manifest)) and read_json(self.manifest).get('requirements')!=self.signature}
    def set_status(self,phase,message,error=''):
        with self.lock:self.phase=phase;self.message=message;self.error=error
    def ensure(self,setup=False,retry=False):
        with self.lock:
            if self.closing:return self.status()
            if self.thread and self.thread.is_alive():return self.status()
            self.status()  # Notice a dead child before deciding to return ready.
            if self.phase=='ready' and not setup and not retry:return self.status()
            if self.phase in ('error','needs_setup','needs_update') and not setup and not retry:return self.status()
            self.phase='checking';self.message='Đang kiểm tra VieNeu đã lưu trên máy…';self.error=''
            self.thread=threading.Thread(target=self._worker,args=(setup,),daemon=True);self.thread.start();return self.status()
    def flags(self):return subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
    def python_path(self,venv):return Path(venv)/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    def probe(self,python):
        if not Path(python).is_file():return False
        code="import sys,json,importlib.metadata as m,importlib.util as u,importlib.resources as r; assert sys.version_info[:2]==(3,11); assert sys.maxsize>2**32; assert m.version('vieneu')=="+repr(self.sdk_version)+"; assert all(u.find_spec(n) for n in ['fastapi','uvicorn','multipart']); assert json.loads(r.files('vieneu').joinpath('assets/voices_v3_turbo.json').read_text(encoding='utf-8')).get('presets')"
        try:return subprocess.run([str(python),'-c',code],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=25,creationflags=self.flags(),env=portable_environment(self.root)).returncode==0
        except (OSError,subprocess.SubprocessError):return False
    def legacy_roots(self):
        roots=[self.kit,Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'BanTinStudioAI']
        if os.name=='nt':roots.append(Path('D:/ban-tin-vieneu'))
        return roots
    def migrate(self):
        marker=self.data/'portable-migration.json'
        if marker.exists():return
        self.set_status('migrating','Đang sao chép mô hình/giọng cũ về thư mục tool. Dữ liệu gốc được giữ nguyên…')
        for src in self.legacy_roots():
            for name in ['my-voices','models-local']:
                copy_missing(src/name,self.data/name,lambda p:name!='my-voices' or p.suffix.lower() in ('.wav','.json'))
            if not self.prepared.exists() and (src/'prepared.json').is_file():
                value=read_json(src/'prepared.json')
                if value.get('requirements')==self.signature:write_json(self.prepared,value)
        hubs=[Path.home()/'.cache/huggingface/hub']
        for key in ['HF_HUB_CACHE','HUGGINGFACE_HUB_CACHE']:
            if os.environ.get(key):hubs.append(Path(os.environ[key]))
        if os.environ.get('HF_HOME'):hubs.append(Path(os.environ['HF_HOME'])/'hub')
        for src in self.legacy_roots():hubs.append(src/'cache/huggingface/hub')
        # Copy only recognized TTS/subtitle repos, not other tools' entire cache.
        def related(relative):
            repo=relative.parts[0].lower()
            return repo.startswith('models--') and any(key in repo for key in ('vieneu','neucodec','faster-whisper-base','faster-whisper-small','silero-vad','campplus','zipenhancer'))
        for src in dict.fromkeys(hubs):
            if src.is_dir():
                for repo in src.iterdir():
                    if repo.is_dir() and related(Path(repo.name)):copy_missing(repo,self.data/'cache/huggingface/hub'/repo.name)
        write_json(marker,{'version':1,'completed_at':time.time()})
    def detect_python(self):
        candidates=[]
        if os.name=='nt':
            py=shutil.which('py')
            if py:candidates.append([py,'-3.11'])
            candidates.extend([[str(Path(os.environ.get('LOCALAPPDATA',''))/'Programs/Python/Python311/python.exe')],[str(Path(os.environ.get('PROGRAMFILES','C:/Program Files'))/'Python311/python.exe')]])
        for name in ['python3.11','python']:
            p=shutil.which(name)
            if p:candidates.append([p])
        for command in candidates:
            try:
                r=subprocess.run(command+['-c','import sys; assert sys.version_info[:2]==(3,11); assert sys.maxsize>2**32; print(sys.executable)'],capture_output=True,text=True,encoding='utf-8',timeout=15,creationflags=self.flags(),env=portable_environment(self.root))
                if r.returncode==0 and r.stdout.strip():return [r.stdout.strip()]
            except (OSError,subprocess.SubprocessError):pass
        raise VoiceError('Cần cài Python 3.11 (64-bit) một lần để chạy AI. Python portable của phần dựng video không thay thế môi trường AI. Cài xong bấm Chuẩn bị VieNeu một lần nữa.')
    def command(self,args,timeout=1800):
        if self.closing:raise VoiceError('Đã đóng tool.')
        with self.log.open('ab') as log:
            p=subprocess.Popen([str(x) for x in args],stdout=log,stderr=subprocess.STDOUT,creationflags=self.flags(),env=portable_environment(self.root));self.process=p
            try:result=p.wait(timeout=timeout)
            except subprocess.TimeoutExpired:p.terminate();raise VoiceError('Chuẩn bị thư viện quá lâu. Kiểm tra Internet rồi thử lại.')
        if self.closing:raise VoiceError('Đã đóng tool.')
        if result:raise VoiceError('Chưa cài được thư viện AI. Kiểm tra Internet/dung lượng; xem vieneu.log trong thư mục dữ liệu rồi thử lại.')
    def runtime(self,allow_install):
        manifest=read_json(self.manifest);saved=Path(manifest.get('python') or '.venv/missing')
        existing=(self.data/saved).resolve() if not saved.is_absolute() else saved.resolve()
        if not existing.is_relative_to(self.data):existing=self.python_path(self.data/'.venv')
        if not allow_install and manifest.get('requirements')==self.signature and self.probe(existing):return existing
        candidates=[self.python_path(self.data/'.venv')]
        for python in candidates:
            if not allow_install and self.probe(python):write_json(self.manifest,{'requirements':self.signature,'python':str(python.relative_to(self.data))});return python
        if not allow_install:return None
        self.set_status('installing','Đang cài thư viện VieNeu một lần đầu tiên. Giữ tool mở; lần sau sẽ dùng lại.')
        venv=self.data/'.venv';python=existing if self.probe(existing) else self.python_path(venv)
        if not python.exists():self.command(self.detect_python()+['-m','venv',str(venv)])
        self.command([python,'-m','pip','install','--disable-pip-version-check','-r',str(self.kit/'requirements.txt')])
        if not self.probe(python):
            # pip considers an installed distribution satisfied even when a
            # missing/corrupt SDK asset makes its entire voice catalog empty.
            self.command([python,'-m','pip','install','--disable-pip-version-check','--force-reinstall','--no-deps','vieneu=='+self.sdk_version])
        if not self.probe(python):raise VoiceError('Môi trường AI hoặc tệp giọng SDK chưa đầy đủ. Xem chẩn đoán rồi bấm Chuẩn bị / sửa thư viện.')
        write_json(self.manifest,{'requirements':self.signature,'python':str(python.relative_to(self.data))});return python
    def environment(self,offline):
        env=portable_environment(self.root);env.update({'SITE_ORIGIN':self.origin,'STUDIO_PAIRING_CODE':self.token,'STUDIO_VOICE_PORT':str(self.port),'STUDIO_MANAGED':'1','STUDIO_PARENT_PID':str(os.getpid()),'STUDIO_VOICE_DATA':str(self.data/'my-voices'),'STUDIO_MODEL_DIR':str(self.data/'models-local'),'STUDIO_FIRST_PREPARE':'0' if offline else '1','HF_HUB_DISABLE_TELEMETRY':'1','HF_HUB_DISABLE_UPDATE_CHECK':'1','PYTHONUNBUFFERED':'1','PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'})
        env['STUDIO_PREFER_CACHE']='1' if offline else '0'
        # Do not force the whole process offline: missing optional ASR/clone
        # models need to download on first use. ONNX prefers cached artifacts.
        # Honor an explicitly configured offline environment except during setup.
        if not offline:env.pop('HF_HUB_OFFLINE',None);env.pop('TRANSFORMERS_OFFLINE',None)
        return env

    def diagnostics(self):
        with self.lock:
            state=self.status();state.pop('voices',None)
            info={'state':state,'sdk':self.sdk_version,'python':str(self.data/read_json(self.manifest).get('python','')),'log_path':str(self.log)}
            try:
                with self.log.open('rb') as stream:
                    stream.seek(0,2);length=stream.tell();stream.seek(max(0,length-24000));tail=stream.read().decode('utf-8',errors='replace')
            except OSError:tail='Chưa có nhật ký. Bấm Kết nối lại để thử nạp VieNeu.'
            if self.token:tail=tail.replace(self.token,'[đã ẩn]')
            tail=re.sub(r'(?i)(?:Bearer\s+|hf_)[A-Za-z0-9_-]+','[đã ẩn]',tail)
            for name in ('error','message'):
                value=state.get(name,'')
                if self.token:value=value.replace(self.token,'[đã ẩn]')
                state[name]=re.sub(r'(?i)(?:Bearer\s+|hf_)[A-Za-z0-9_-]+','[đã ẩn]',value)
            info['log_tail']=tail
            return info
    def request(self,path,body=None,content_type=None,timeout=300):
        if not self.port or not self.token:raise VoiceError('VieNeu chưa sẵn sàng.')
        headers={'Authorization':'Bearer '+self.token}
        if content_type:headers['Content-Type']=content_type
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}'+path,data=body,headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=timeout) as r:return r.status,r.read(),r.headers.get('Content-Type','application/json')
        except urllib.error.HTTPError as e:return e.code,e.read(16384),'application/json'
        except (OSError,ValueError) as e:raise VoiceError('Bộ chạy VieNeu chưa trả lời. Thử kết nối lại hoặc chuẩn bị/kiểm tra cập nhật.') from e
    def _worker(self,setup):
        try:
            with installation_lock(self.data):
                if self.closing:return
                manifest=read_json(self.manifest)
                if manifest and manifest.get('requirements')!=self.signature and not setup:
                    self.set_status('needs_update','Có phiên bản bộ chạy mới. Bấm Chuẩn bị / kiểm tra cập nhật; mô hình và giọng cũ được giữ.');return
                self.stop_process();self.migrate()
                python=self.runtime(setup)
                if python is None:self.set_status('needs_setup','Bấm Chuẩn bị VieNeu lần đầu. Sau đó tool sẽ tự mở và kết nối lại.');return
                self.set_status('starting','Đang mở VieNeu và nạp mô hình đã lưu vào bộ nhớ…');self.stop_process()
                with socket.socket() as sock:sock.bind(('127.0.0.1',0));self.port=sock.getsockname()[1]
                self.token=secrets.token_urlsafe(32);offline=not setup and read_json(self.prepared).get('requirements')==self.signature
                with self.log.open('ab') as log:self.process=subprocess.Popen([str(python),str(self.kit/'server.py')],cwd=self.kit,env=self.environment(offline),stdout=log,stderr=subprocess.STDOUT,creationflags=self.flags())
                deadline=time.monotonic()+180
                while True:
                    if self.closing:return
                    if self.process.poll() is not None:raise VoiceError('VieNeu đã dừng khi khởi động (mã thoát '+str(self.process.poll())+'). Mở Chẩn đoán VieNeu để xem lỗi, hoặc bấm Chuẩn bị / sửa thư viện; dữ liệu giọng vẫn được giữ.')
                    try:
                        code,body,_=self.request('/health',timeout=2)
                        if code==200 and json.loads(body).get('protocol')=='ban-tin-local-v1':break
                    except (VoiceError,ValueError):pass
                    if time.monotonic()>deadline:raise VoiceError('Mở VieNeu quá lâu. Xem vieneu.log rồi thử lại.')
                    time.sleep(.5)
                self.set_status('loading','Đang nạp mô hình giọng từ cache…' if offline else 'Đang chuẩn bị riêng bộ tạo giọng VieNeu. File đã có sẽ được dùng lại; giữ tool mở.')
                code,body,_=self.request('/v1/prepare',body=b'{}',content_type='application/json',timeout=1800)
                if code!=200:
                    detail=json.loads(body).get('detail','Chưa chuẩn bị được mô hình.')
                    raise VoiceError(str(detail)+' Nếu cache thiếu tệp, bấm Chuẩn bị / kiểm tra cập nhật khi có Internet.')
                result=json.loads(body);self.voices=result.get('data',[])
                if not self.voices:raise VoiceError('VieNeu chưa trả danh sách giọng.')
                write_json(self.prepared,{'requirements':self.signature,'models':result.get('models',['v3turbo']),'prepared_at':time.time()})
                if not self.closing:self.set_status('ready','VieNeu sẵn sàng. Mô hình và giọng được lưu trên máy; lần sau tự kết nối.')
        except Exception as e:
            if not self.closing:
                self.set_status('error','Chưa mở được VieNeu.',str(e))
                # Preserve a real loaded catalog for diagnosis if a subsequent
                # warm-up failed; never manufacture placeholder voice entries.
                try:
                    code,body,_=self.request('/v1/voices',timeout=2)
                    if code==200:self.voices=json.loads(body).get('data',[])
                except (VoiceError,ValueError):pass
                self.stop_process()
        finally:
            if self.closing:self.stop_process()
    def proxy(self,path,body=None,content_type=None):
        if path not in ('/health','/v1/voices','/v1/audio/speech','/v1/audio/transcribe'):raise VoiceError('Tác vụ VieNeu không được hỗ trợ.')
        state=self.status()
        if not state['ready']:raise VoiceError(state['error'] or state['message'])
        result=self.request(path,body,content_type)
        if path=='/v1/voices' and result[0]==200:
            listing=result if body is None else self.request('/v1/voices')
            if listing[0]==200:
                with self.lock:self.voices=json.loads(listing[1]).get('data',self.voices)
        return result
    def stop_process(self):
        p=self.process
        if p and p.poll() is None:
            p.terminate()
            try:p.wait(timeout=5)
            except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)
        self.process=None
    def close(self):
        self.closing=True;self.stop_process()
