"""Online customer licence checks. No administrator credentials belong in this module."""
from __future__ import annotations
import hashlib,json,os,platform,secrets,threading,time,urllib.error,urllib.parse,urllib.request,uuid
from pathlib import Path

class LicenseError(Exception):
    pass

def machine_id():
    identity=''
    if os.name=='nt':
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,r'SOFTWARE\Microsoft\Cryptography',0,winreg.KEY_READ|winreg.KEY_WOW64_64KEY) as k:
            identity=str(winreg.QueryValueEx(k,'MachineGuid')[0])
    else:
        for p in ['/etc/machine-id','/var/lib/dbus/machine-id']:
            if Path(p).exists():identity=Path(p).read_text().strip();break
    if not identity:identity=f'{platform.node()}:{uuid.getnode()}'
    return hashlib.sha256(('ban-tin-studio-v1:'+identity).encode()).hexdigest()

def valid_server_url(url):
    u=urllib.parse.urlsplit(url)
    if u.username or u.password or u.query or u.fragment or u.path not in ('','/'):
        raise LicenseError('Địa chỉ máy chủ cần là một tên miền HTTPS, không kèm đường dẫn.')
    if u.scheme!='https' and not (u.scheme=='http' and u.hostname in ('127.0.0.1','localhost','::1')):
        raise LicenseError('Máy chủ bản quyền trên Internet phải dùng HTTPS.')
    if not u.hostname:raise LicenseError('Chủ tool chưa cấu hình máy chủ bản quyền.')
    return url.rstrip('/')

class RemoteLicense:
    def __init__(self,url,data,device=None,transport=None,clock=time.monotonic):
        self.url=valid_server_url(url);self.path=Path(data)/'activation.json';self.path.parent.mkdir(parents=True,exist_ok=True)
        self.device=device or machine_id();self.transport=transport or self._request;self.clock=clock
        self.lock=threading.RLock();self.deadline=0.;self.state={'ok':False,'message':'Nhập mã kích hoạt do người bán cung cấp.'}
        try:self.key=json.loads(self.path.read_text(encoding='utf-8'))['key']
        except (OSError,ValueError,KeyError):self.key=''
    def _request(self,payload):
        req=urllib.request.Request(self.url+'/api/v1/check',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','User-Agent':'BanTinStudioDesktop/1.0'},method='POST')
        try:
            with urllib.request.urlopen(req,timeout=8) as r:return json.loads(r.read(16384))
        except urllib.error.HTTPError as e:
            try:body=json.loads(e.read(16384))
            except Exception:body={}
            raise LicenseError(body.get('error','Không xác thực được bản quyền.')) from e
        except (OSError,ValueError) as e:raise LicenseError('Không kết nối được máy chủ bản quyền. Kiểm tra Internet rồi thử lại.') from e
    def activate(self,key):
        key=str(key).strip().upper()
        if len(key)<20 or len(key)>160:raise LicenseError('Mã kích hoạt không đúng định dạng.')
        with self.lock:
            result=self._verify(key)
            if not result['ok']:raise LicenseError(result['message'])
            self.key=key
            tmp=self.path.with_suffix('.tmp');tmp.write_text(json.dumps({'key':key}),encoding='utf-8');tmp.replace(self.path)
            try:os.chmod(self.path,0o600)
            except OSError:pass
            return self._snapshot()
    def _snapshot(self):
        return {**self.state,'lease_seconds':max(0.,self.deadline-self.clock())}
    def _verify(self,key):
        # Durations use a monotonic clock; changing Windows date cannot extend a cached check.
        started=self.clock();nonce=secrets.token_urlsafe(24)
        try:
            payload=self.transport({'key':key,'device':self.device,'nonce':nonce})
            if payload.get('nonce')!=nonce or payload.get('ok') is not True:raise LicenseError('Phản hồi xác thực không hợp lệ.')
            valid_for=float(payload['valid_for']);remaining=float(payload['remaining'])
            if not (0<valid_for<=30 and remaining>0):raise LicenseError('Bản quyền đã hết hạn. Liên hệ người bán để gia hạn.')
            self.deadline=started+min(valid_for,remaining,30)
            if self.clock()>=self.deadline:raise LicenseError('Xác thực quá chậm. Vui lòng thử lại.')
            self.state={'ok':True,'expires_at':payload['expires_at'],'customer':str(payload.get('customer',''))[:120],'remaining':remaining,'message':'Bản quyền đang hoạt động.'}
        except (LicenseError,ValueError,KeyError,TypeError) as e:
            self.deadline=0;self.state={'ok':False,'message':str(e) if isinstance(e,LicenseError) else 'Phản hồi máy chủ bản quyền không hợp lệ.'}
        return self._snapshot()
    def check(self,force=False):
        with self.lock:
            if not self.key:return {'ok':False,'message':'Nhập mã kích hoạt do người bán cung cấp.'}
            if not force and self.clock()<self.deadline:return self._snapshot()
            return self._verify(self.key)
