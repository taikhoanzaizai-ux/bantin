from pathlib import Path
import contextlib,http.cookiejar,io,json,re,struct,sys,time,tempfile,threading,urllib.error,urllib.request,zipfile
ROOT=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(ROOT/'app'));sys.path.insert(0,str(ROOT/'manager'))
import license_server
from licensing import RemoteLicense
from local_server import LocalApp
@contextlib.contextmanager
def running(server):
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:yield f'http://127.0.0.1:{server.server_port}'
    finally:server.shutdown();server.server_close();thread.join()
def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def call(client,base,path,body=None,headers=None):
    with client.open(urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})}),timeout=10) as response:return response.read()
with tempfile.TemporaryDirectory() as temp:
    data=Path(temp);store=license_server.Store(data/'authority')
    authority=license_server.Authority(('127.0.0.1',0),store)
    with running(authority) as base:
        admin=client();call(admin,base,'/?launch='+authority.bootstrap);csrf=json.loads(call(admin,base,'/api/admin/me'))['csrf'];headers={'X-Studio-CSRF':csrf}
        call(admin,base,'/api/admin/settings',{'server_url':base,'contact':'Quân'},headers)
        payload=call(admin,base,'/api/admin/package',{},headers)
        with zipfile.ZipFile(io.BytesIO(payload)) as z:
            assert z.testzip() is None
            assert not any('/manager/' in name or '/source/' in name or '/data/' in name or 'owner_launcher' in name for name in z.namelist())
            assert b'1.13.0' in z.read('BanTinStudio/VERSION.txt')
            exe=z.read('BanTinStudio/Quân Bản Tin.exe');pe=struct.unpack_from('<I',exe,0x3c)[0];assert struct.unpack_from('<H',exe,pe+24+68)[0]==2
            code=b''.join(z.read(name) for name in z.namelist() if '/web/assets/' in name and name.endswith('.js'))
            assert z.read('BanTinStudio/app/desktop_session.py')==(ROOT/'app/desktop_session.py').read_bytes()
            assert z.read('BanTinStudio/local-voice/server.py')==(ROOT/'local-voice/server.py').read_bytes()
            assert 'Kịch bản dài được dựng đầy đủ'.encode() in code
            assert z.read('BanTinStudio/app/article_import.py')==(ROOT/'app/article_import.py').read_bytes()
            assert 'Từ link bài viết'.encode() in code and 'Lấy bài, lưu ảnh & tạo kịch bản'.encode() in code
            assert 'Intro bản tin nóng'.encode() in code and 'Thêm clip intro'.encode() in code
            assert 'Mẫu chân trang trong intro'.encode() in code and 'Zoom lùi chậm'.encode() in code
            assert 'Chọn mẫu để xem video'.encode() in code and 'Tự phối Giữ trọn / Phủ kín'.encode() in code
            assert 'Kịch bản & giọng đọc từng video'.encode() in code and 'Tải SRT của video đang chọn'.encode() in code
            assert 'Đặt lại giao diện mặc định'.encode() in code and 'Màu giao diện tùy chọn'.encode() in code
            assert 'Chỉnh chữ riêng'.encode() in code and 'Lưu chữ vào kho mẫu'.encode() in code
            assert 'Đặt lại bố cục'.encode() in code and 'Chân trang riêng'.encode() in code
            assert 'Kéo chữ trực tiếp trên video'.encode() in code and 'Chữ tiêu đề'.encode() in code
            z.extractall(data/'client')
        entry=json.loads(call(admin,base,'/api/admin/licenses',{'customer':'QA','days':30,'max_devices':1},headers))
        license=RemoteLicense(base,data/'activation');web=data/'client/BanTinStudio/web'
        local=LocalApp(('127.0.0.1',0),license,web)
        with running(local) as app:
            browser=client();call(browser,app,'/?launch='+local.token)
            assert not json.loads(call(browser,app,'/_desktop/status'))['ok']
            call(browser,app,'/_desktop/activate',{'key':entry['key']},{'X-Studio-CSRF':local.csrf})
            assert json.loads(call(browser,app,'/_desktop/status'))['ok']
            page=call(browser,app,'/studio');assets=re.findall(rb'(?:src|href)="(/assets/[^\"]+)"',page);assert len(assets)>=2
            for path in assets:assert len(call(browser,app,path.decode()))>0
            now=time.time();store.clock=lambda:now+31*86400;license.deadline=0;assert not json.loads(call(browser,app,'/_desktop/status'))['ok']
            try:call(browser,app,assets[0].decode());raise AssertionError('Expired customer received UI assets')
            except urllib.error.HTTPError as error:assert error.code==403
            call(admin,base,'/api/admin/licenses/'+entry['id']+'/extend',{'days':30},headers);assert json.loads(call(browser,app,'/_desktop/status'))['ok']
print('PASS: actual customer ZIP through authenticated admin API, branded GUI launcher, intro build, version 1.13.0, no owner/data leak, real asset gate and activation/expiry/renewal.')
