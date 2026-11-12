"""Owner-only administration and a small online activation API backed by SQLite."""
from __future__ import annotations
import contextlib,datetime as dt,hashlib,hmac,io,json,os,re,secrets,sqlite3,sys,threading,time,urllib.parse,webbrowser,zipfile
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'app'))
from licensing import valid_server_url,LicenseError
from portable import storage,migrate_licenses
BASE=Path(__file__).resolve().parent

def utc(value):return dt.datetime.fromtimestamp(value,dt.timezone.utc).isoformat(timespec='seconds')
def key_hash(key):return hashlib.sha256(str(key).strip().upper().encode()).hexdigest()
def new_key():return 'BTS-'+secrets.token_hex(16).upper()

class Store:
    def __init__(self,data,clock=time.time):
        self.data=Path(data);self.data.mkdir(parents=True,exist_ok=True);self.path=self.data/'licenses.sqlite3';self.clock=clock;self.settings_path=self.data/'settings.json'
        with self.connect() as c:
            c.executescript('''CREATE TABLE IF NOT EXISTS licenses(id TEXT PRIMARY KEY,customer TEXT NOT NULL,key_hash TEXT NOT NULL UNIQUE,expires REAL NOT NULL,max_devices INTEGER NOT NULL,enabled INTEGER NOT NULL,created REAL NOT NULL);CREATE TABLE IF NOT EXISTS devices(license_id TEXT NOT NULL,device TEXT NOT NULL,seen REAL NOT NULL,PRIMARY KEY(license_id,device),FOREIGN KEY(license_id) REFERENCES licenses(id));CREATE TABLE IF NOT EXISTS audit(at REAL NOT NULL,action TEXT NOT NULL,license_id TEXT NOT NULL);''')
    @contextlib.contextmanager
    def connect(self):
        c=sqlite3.connect(self.path,timeout=10);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')
        try:
            with c:yield c
        finally:c.close()
    def settings(self):
        try:return json.loads(self.settings_path.read_text(encoding='utf-8'))
        except (OSError,ValueError):return {'server_url':'','contact':''}
    def save_settings(self,value):
        url=valid_server_url(str(value.get('server_url','')).strip());contact=str(value.get('contact','')).strip()[:200]
        if not contact:raise ValueError('Nhập thông tin liên hệ gia hạn để hiển thị cho khách.')
        data={'server_url':url,'contact':contact};self.settings_path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8');return data
    def list(self):
        now=self.clock()
        with self.connect() as c:
            rows=c.execute('SELECT l.*,count(d.device) device_count FROM licenses l LEFT JOIN devices d ON l.id=d.license_id GROUP BY l.id ORDER BY l.created DESC').fetchall()
        return [{'id':r['id'],'customer':r['customer'],'expires_at':utc(r['expires']),'max_devices':r['max_devices'],'devices':r['device_count'],'enabled':bool(r['enabled']),'expired':r['expires']<=now} for r in rows]
    def create(self,customer,days=30,max_devices=1,expires_at=None):
        customer=str(customer).strip()[:120]
        if not customer:raise ValueError('Nhập tên khách hàng.')
        days=int(days);max_devices=int(max_devices)
        if not (1<=days<=3660 and 1<=max_devices<=10):raise ValueError('Số ngày từ 1–3660; số máy từ 1–10.')
        now=self.clock();expires=self.parse_date(expires_at) if expires_at else now+days*86400
        if expires<=now:raise ValueError('Ngày hết hạn phải ở tương lai.')
        identifier=secrets.token_urlsafe(12);key=new_key()
        with self.connect() as c:c.execute('INSERT INTO licenses VALUES(?,?,?,?,?,?,?)',(identifier,customer,key_hash(key),expires,max_devices,1,now));c.execute('INSERT INTO audit VALUES(?,?,?)',(now,'create',identifier))
        return {'id':identifier,'key':key,'customer':customer,'expires_at':utc(expires)}
    @staticmethod
    def parse_date(value):
        d=dt.datetime.fromisoformat(str(value).replace('Z','+00:00'))
        if d.tzinfo is None:raise ValueError('Ngày hết hạn cần kèm múi giờ.')
        return d.timestamp()
    def update(self,identifier,action,body):
        now=self.clock();result={'ok':True}
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');row=c.execute('SELECT * FROM licenses WHERE id=?',(identifier,)).fetchone()
            if not row:raise ValueError('Không tìm thấy khách hàng.')
            if action=='extend':
                days=int(body.get('days',30))
                if not 1<=days<=3660:raise ValueError('Số ngày gia hạn không hợp lệ.')
                c.execute('UPDATE licenses SET expires=? WHERE id=?',(max(now,row['expires'])+days*86400,identifier))
            elif action=='expiry':
                expires=self.parse_date(body.get('expires_at'))
                if expires<=now:raise ValueError('Ngày hết hạn phải ở tương lai.')
                c.execute('UPDATE licenses SET expires=? WHERE id=?',(expires,identifier))
            elif action=='toggle':c.execute('UPDATE licenses SET enabled=? WHERE id=?',(0 if row['enabled'] else 1,identifier))
            elif action=='reset-devices':c.execute('DELETE FROM devices WHERE license_id=?',(identifier,))
            elif action=='rotate-key':
                key=new_key();c.execute('UPDATE licenses SET key_hash=? WHERE id=?',(key_hash(key),identifier));c.execute('DELETE FROM devices WHERE license_id=?',(identifier,));result['key']=key
            else:raise ValueError('Thao tác không hợp lệ.')
            c.execute('INSERT INTO audit VALUES(?,?,?)',(now,action,identifier))
        return result
    def check(self,key,device,nonce):
        if not re.fullmatch(r'[a-f0-9]{64}',str(device)):raise LicenseError('Mã máy không hợp lệ.')
        if not isinstance(nonce,str) or not 20<=len(nonce)<=100:raise LicenseError('Yêu cầu xác thực không hợp lệ.')
        now=self.clock()
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');r=c.execute('SELECT * FROM licenses WHERE key_hash=?',(key_hash(key),)).fetchone()
            if not r:raise LicenseError('Mã kích hoạt không tồn tại. Liên hệ người bán.')
            if not r['enabled']:raise LicenseError('Mã này đã bị khóa. Liên hệ người bán.')
            if r['expires']<=now:raise LicenseError('Bản quyền đã hết hạn. Liên hệ người bán để gia hạn.')
            exists=c.execute('SELECT 1 FROM devices WHERE license_id=? AND device=?',(r['id'],device)).fetchone()
            if not exists:
                count=c.execute('SELECT count(*) FROM devices WHERE license_id=?',(r['id'],)).fetchone()[0]
                if count>=r['max_devices']:raise LicenseError('Mã đã đủ số máy được phép. Nhờ người bán gỡ máy cũ nếu bạn đổi máy.')
            c.execute('INSERT INTO devices VALUES(?,?,?) ON CONFLICT(license_id,device) DO UPDATE SET seen=excluded.seen',(r['id'],device,now))
        remaining=r['expires']-now
        return {'ok':True,'nonce':nonce,'expires_at':utc(r['expires']),'remaining':remaining,'valid_for':min(30,remaining),'customer':r['customer']}
    def customer_zip(self):
        config=self.settings();valid_server_url(config.get('server_url',''))
        if not config.get('contact'):raise ValueError('Điền địa chỉ máy chủ và thông tin liên hệ trước.')
        source=BASE/'customer-template.zip'
        if not source.exists():raise ValueError('Không tìm thấy customer-template.zip trong bộ quản lý.')
        out=io.BytesIO()
        with zipfile.ZipFile(source) as src,zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as dst:
            for f in src.infolist():
                if f.filename!='BanTinStudio/client-config.json':dst.writestr(f,src.read(f.filename))
            dst.writestr('BanTinStudio/client-config.json',json.dumps(config,ensure_ascii=False,indent=2))
        return out.getvalue()

class Authority(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,address,store):
        super().__init__(address,Handler);self.store=store;self.sessions={};self.attempts={};self.lock=threading.Lock();self.bootstrap=secrets.token_urlsafe(32)
        self.auth_path=store.data/'admin-auth.json'
        if not self.auth_path.exists():
            password=secrets.token_urlsafe(24);salt=secrets.token_bytes(16);digest=hashlib.scrypt(password.encode(),salt=salt,n=16384,r=8,p=1).hex()
            self.auth_path.write_text(json.dumps({'salt':salt.hex(),'hash':digest}),encoding='utf-8')
            (store.data/'MAT-KHAU-QUAN-TRI.txt').write_text('Tên đăng nhập: admin\nMật khẩu: '+password+'\nĐây là tài khoản riêng của bạn. Không gửi file này cho khách.\n',encoding='utf-8')
            try:os.chmod(self.auth_path,0o600);os.chmod(store.data/'MAT-KHAU-QUAN-TRI.txt',0o600)
            except OSError:pass
        self.auth=json.loads(self.auth_path.read_text(encoding='utf-8'))
    def password_ok(self,password):
        if not isinstance(password,str) or len(password)>256:return False
        test=hashlib.scrypt(password.encode(),salt=bytes.fromhex(self.auth['salt']),n=16384,r=8,p=1).hex()
        return hmac.compare_digest(test,self.auth['hash'])
    def login(self):
        session=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(32)
        with self.lock:
            now=time.monotonic();self.sessions={k:v for k,v in self.sessions.items() if v['expires']>now}
            if len(self.sessions)>=100:self.sessions.pop(next(iter(self.sessions)))
            self.sessions[session]={'csrf':csrf,'expires':now+8*3600}
        return session
    def rate_limit(self,ip,kind):
        now=time.monotonic();limit=12 if kind=='login' else 1200;key=(ip,kind)
        with self.lock:
            if len(self.attempts)>10000:self.attempts={k:v for k,v in self.attempts.items() if now-v[0]<60}
            window,count=self.attempts.get(key,(now,0))
            if now-window>=60:window,count=now,0
            self.attempts[key]=(window,count+1)
            return count<limit

class Handler(BaseHTTPRequestHandler):
    server_version='BanTinLicense/1.0'
    def setup(self):super().setup();self.connection.settimeout(15)
    def log_message(self,*args):pass
    def send(self,status,body,kind='application/json',session=None,filename=None,clear_cookie=False):
        if isinstance(body,(dict,list)):body=json.dumps(body,ensure_ascii=False).encode()
        if isinstance(body,str):body=body.encode()
        self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');self.send_header('Referrer-Policy','no-referrer')
        if session:
            secure='; Secure' if os.environ.get('BTS_PUBLIC_HTTPS')=='1' else ''
            self.send_header('Set-Cookie',f'bts_admin={session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{secure}')
        if clear_cookie:self.send_header('Set-Cookie','bts_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
        if filename:self.send_header('Content-Disposition',f'attachment; filename="{filename}"')
        self.end_headers();self.wfile.write(body)
    def auth(self,csrf=False):
        try:sid=SimpleCookie(self.headers.get('Cookie',''))['bts_admin'].value
        except (KeyError,ValueError):return None
        with self.server.lock:s=self.server.sessions.get(sid)
        if not s or s['expires']<=time.monotonic():return None
        if csrf:
            if not hmac.compare_digest(self.headers.get('X-Studio-CSRF',''),s['csrf']):return None
            origin=self.headers.get('Origin')
            if origin and urllib.parse.urlsplit(origin).netloc!=self.headers.get('Host'):return None
        return s
    def body(self):
        n=int(self.headers.get('Content-Length','0'))
        if not 0<n<=4096:raise ValueError('Yêu cầu không hợp lệ hoặc quá lớn.')
        b=json.loads(self.rfile.read(n))
        if not isinstance(b,dict):raise ValueError('Yêu cầu phải là JSON.')
        return b
    def do_GET(self):
        u=urllib.parse.urlsplit(self.path)
        if u.path=='/':
            token=urllib.parse.parse_qs(u.query).get('launch',[''])[0]
            if self.client_address[0] in ('127.0.0.1','::1') and secrets.compare_digest(token,self.server.bootstrap):
                self.send_response(303);self.send_header('Location','/');self.send_header('Referrer-Policy','no-referrer');self.send_header('Cache-Control','no-store');self.send_header('Set-Cookie',f'bts_admin={self.server.login()}; HttpOnly; SameSite=Strict; Path=/');self.send_header('Content-Length','0');self.end_headers();return
            self.send(200,(BASE/'admin.html').read_bytes(),'text/html; charset=utf-8');return
        if u.path=='/health':self.send(200,{'status':'ok','service':'ban-tin-license-v1'});return
        s=self.auth()
        if not s:self.send(401,{'error':'Cần đăng nhập quản trị.'});return
        if u.path=='/api/admin/me':self.send(200,{'csrf':s['csrf'],'settings':self.server.store.settings(),'server_time':utc(self.server.store.clock())});return
        if u.path=='/api/admin/licenses':self.send(200,{'licenses':self.server.store.list()});return
        self.send(404,{'error':'Không tìm thấy.'})
    def do_POST(self):
        try:
            body=self.body()
            if self.path=='/api/v1/check':
                if not self.server.rate_limit(self.client_address[0],'check'):self.send(429,{'error':'Quá nhiều yêu cầu. Chờ một phút rồi thử lại.'});return
                self.send(200,self.server.store.check(body.get('key',''),body.get('device',''),body.get('nonce','')));return
            if self.path=='/api/admin/login':
                if not self.server.rate_limit(self.client_address[0],'login'):self.send(429,{'error':'Thử đăng nhập quá nhiều lần. Chờ một phút.'});return
                if not self.server.password_ok(body.get('password')):self.send(401,{'error':'Mật khẩu chưa đúng.'});return
                self.send(200,{'ok':True},session=self.server.login());return
            if not self.auth(csrf=True):self.send(403,{'error':'Phiên quản trị không hợp lệ. Đăng nhập lại.'});return
            if self.path=='/api/admin/logout':
                sid=SimpleCookie(self.headers.get('Cookie',''))['bts_admin'].value
                with self.server.lock:self.server.sessions.pop(sid,None)
                self.send(200,{'ok':True},clear_cookie=True);return
            if self.path=='/api/admin/settings':self.send(200,self.server.store.save_settings(body));return
            if self.path=='/api/admin/package':self.send(200,self.server.store.customer_zip(),'application/zip',filename='BanTinStudio-Khach-Hang.zip');return
            if self.path=='/api/admin/licenses':self.send(201,self.server.store.create(body.get('customer',''),body.get('days',30),body.get('max_devices',1),body.get('expires_at')));return
            m=re.fullmatch(r'/api/admin/licenses/([A-Za-z0-9_-]+)/([a-z-]+)',self.path)
            if m:self.send(200,self.server.store.update(m[1],m[2],body));return
            self.send(404,{'error':'Không tìm thấy.'})
        except LicenseError as e:self.send(403,{'error':str(e)})
        except (ValueError,TypeError,KeyError,OverflowError) as e:self.send(400,{'error':str(e) or 'Dữ liệu chưa hợp lệ.'})
        except Exception:self.send(500,{'error':'Máy chủ gặp lỗi. Kiểm tra dung lượng và thư mục dữ liệu.'})

def main():
    data=Path(os.environ['BTS_LICENSE_DATA']) if os.environ.get('BTS_LICENSE_DATA') else storage(BASE.parent)/'license-server'
    if not os.environ.get('BTS_LICENSE_DATA'):migrate_licenses(data)
    host=os.environ.get('BTS_LICENSE_HOST','127.0.0.1');port=int(os.environ.get('BTS_LICENSE_PORT','8788'))
    server=Authority((host,port),Store(data));print(f'QUẢN LÝ BẢN QUYỀN — {host}:{port}');print('Mật khẩu quản trị nằm tại:',data/'MAT-KHAU-QUAN-TRI.txt');print('Không gửi bộ quản lý hoặc thư mục dữ liệu này cho khách.');print('Dữ liệu cần sao lưu:',data)
    if host=='127.0.0.1':
        from local_server import open_browser
        threading.Timer(.4,open_browser,args=(f'http://127.0.0.1:{port}/?launch={server.bootstrap}',)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=='__main__':main()
