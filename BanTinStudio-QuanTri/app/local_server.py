from __future__ import annotations
import argparse,html,json,mimetypes,os,secrets,subprocess,threading,time,socket,urllib.parse,urllib.request,webbrowser
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from licensing import RemoteLicense,LicenseError
from article_import import ArticleService,ArticleError
from desktop_session import desktop_lock,launch_secret
from portable import storage,browser_command,environment,migrate_client
from voice_manager import VoiceManager,VoiceError,read_json,write_json

ROOT=Path(__file__).resolve().parent.parent
GATE='''<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Quân Bản Tin · Kích hoạt</title><style>body{font:16px Arial;background:#10232d;color:#e5f4ee;margin:0;display:grid;place-items:center;min-height:100vh}.card{width:min(480px,85vw);padding:36px;border:1px solid #34534f;border-radius:18px;background:#17353a}h1{margin-top:0}p{line-height:1.7;color:#b9d0ca}input,button{box-sizing:border-box;width:100%;padding:15px;border-radius:9px;border:0;margin-top:10px;font:inherit}button{background:#63dfb4;color:#123329;font-weight:bold;cursor:pointer}.muted{font-size:12px;overflow-wrap:anywhere}#status{color:#ffd98a}a{color:#8fe9c8}</style><main class="card"><h1>QUÂN BẢN TIN</h1><p id="explain">Nhập mã do người bán cấp để sử dụng tool trên máy này. Máy cần Internet để kiểm tra thời hạn.</p><form id="form"><input id="key" placeholder="BTS-..." autocomplete="off" maxlength="160" required aria-label="Mã kích hoạt"><button id="submit">Kích hoạt / Kiểm tra gia hạn</button></form><p id="status" role="status"></p><p class="muted" id="contact"></p><p class="muted">Mã máy: <span id="device"></span></p></main><script>const boot=BOOT_DATA;document.getElementById('contact').textContent='Liên hệ gia hạn: '+boot.contact;document.getElementById('device').textContent=boot.device;async function status(){try{const r=await fetch('/_desktop/status');const b=await r.json();if(b.ok)location.replace('/studio');else document.getElementById('status').textContent=b.message;}catch{document.getElementById('status').textContent='Bộ chạy cục bộ đã đóng. Mở lại Quân Bản Tin.exe.';}}document.getElementById('form').onsubmit=async e=>{e.preventDefault();const button=document.getElementById('submit');button.disabled=true;document.getElementById('status').textContent='Đang kiểm tra…';try{const r=await fetch('/_desktop/activate',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-CSRF':boot.csrf},body:JSON.stringify({key:document.getElementById('key').value})});const b=await r.json();if(!r.ok)throw Error(b.message||'Chưa kích hoạt được.');location.replace('/studio');}catch(e){document.getElementById('status').textContent=e.message;}finally{button.disabled=false;}};status();setInterval(status,10000);</script></html>'''

class LocalApp(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,address,licensing,web,contact='Người bán tool',voice=None,articles=None,launch_key=None):
        self.voice=voice
        super().__init__(address,Handler);self.licensing=licensing;self.web=Path(web).resolve();self.contact=contact;self.last_seen=time.monotonic();self.pending=0;self.token=secrets.token_urlsafe(32);self.launch_key=launch_key or self.token;self.cookie_name=f'bts_session_{self.server_port}';self.csrf=secrets.token_urlsafe(32);self.voice=voice;self.articles=articles or ArticleService(storage(self.web.parent))

    def server_bind(self):
        # HTTPServer normally enables SO_REUSEADDR. On Windows that permits two
        # live servers to bind one port, randomly sending a launch to the wrong token.
        if os.name=='nt':
            self.allow_reuse_address=False
            self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
        super().server_bind()

    def server_close(self):
        if self.voice:self.voice.close()
        if getattr(self,'articles',None):self.articles.close()
        super().server_close()

class Handler(BaseHTTPRequestHandler):
    server_version='BanTinDesktop/1.0'
    def log_message(self,*args):pass
    def send(self,status,body,content_type='application/json',cookie=False):
        if isinstance(body,(dict,list)):body=json.dumps(body,ensure_ascii=False).encode()
        if isinstance(body,str):body=body.encode()
        self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');self.send_header('Cross-Origin-Resource-Policy','same-origin');self.send_header('Referrer-Policy','no-referrer')
        if cookie:self.send_header('Set-Cookie',f'{self.server.cookie_name}={self.server.token}; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers();self.wfile.write(body)
    def boundary(self):
        host=self.headers.get('Host','');port=self.server.server_port
        if host not in (f'127.0.0.1:{port}',f'localhost:{port}'):
            self.send(403,{'message':'Địa chỉ cục bộ không hợp lệ.'});return False
        origin=self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{port}',f'http://localhost:{port}'):
            self.send(403,{'message':'Nguồn truy cập không được phép.'});return False
        return True
    def authenticated(self):
        try:
            c=SimpleCookie(self.headers.get('Cookie',''));key=self.server.cookie_name if self.server.cookie_name in c else 'bts_session';value=c[key].value
        except (KeyError,ValueError):return False
        return secrets.compare_digest(value,self.server.token)
    def do_GET(self):
        if not self.boundary():return
        url=urllib.parse.urlsplit(self.path);q=urllib.parse.parse_qs(url.query)
        if url.path=='/' and any(secrets.compare_digest(q.get('launch',[''])[0],key) for key in (self.server.launch_key,self.server.token)):
            self.send_response(303);self.send_header('Location','/');self.send_header('Cache-Control','no-store');self.send_header('Referrer-Policy','no-referrer');self.send_header('Set-Cookie',f'{self.server.cookie_name}={self.server.token}; HttpOnly; SameSite=Strict; Path=/');self.send_header('Content-Length','0');self.end_headers();return
        if not self.authenticated():
            if url.path in ('/','/studio','/studio/'):
                self.send(401,'<!doctype html><html lang="vi"><meta charset="utf-8"><title>Quân Bản Tin · Mở lại kết nối</title><style>body{font:16px Arial;background:#10232d;color:#e5f4ee;display:grid;place-items:center;min-height:95vh;margin:0}main{max-width:480px;padding:30px;line-height:1.7}button{padding:12px;border:0;border-radius:8px;cursor:pointer;background:#63dfb4}</style><main><h1>Phiên kết nối đã cũ</h1><p>Đóng cửa sổ này rồi mở <b>Quân Bản Tin.exe</b> trong thư mục đang dùng để nối lại phần mềm.</p><p>Dữ liệu và mô hình đã lưu vẫn được giữ nguyên. Nếu vừa cập nhật từ bản cũ và vẫn gặp lỗi, khởi động lại máy một lần để dừng bộ chạy cũ còn ẩn.</p><button onclick="location.reload()">Thử kết nối lại</button></main></html>','text/html; charset=utf-8')
            else:self.send(401,{'message':'Phiên kết nối đã cũ. Mở lại Quân Bản Tin.exe.'})
            return
        self.server.last_seen=time.monotonic()
        if url.path=='/_desktop/github-update':
            try:
                from urllib.request import Request, urlopen
                suffix=f'?ref=main&check={time.time_ns()}'
                headers={'User-Agent':'Quan-Ban-Tin','Cache-Control':'no-cache'}
                api='https://api.github.com/repos/taikhoanzaizai-ux/bantin/contents/BanTinStudio-QuanTri/VERSION.txt'
                raw='https://raw.githubusercontent.com/taikhoanzaizai-ux/bantin/main/BanTinStudio-QuanTri/VERSION.txt'
                try:
                    with urlopen(Request(api+suffix,headers={**headers,'Accept':'application/vnd.github.raw+json'}),timeout=8) as response:
                        latest=response.read(512).decode('utf-8-sig').strip()
                    if not latest.startswith('Quân Bản Tin Desktop '):raise ValueError('Invalid version response')
                except (OSError,ValueError):
                    with urlopen(Request(raw+suffix,headers=headers),timeout=8) as response:
                        latest=response.read(512).decode('utf-8-sig').strip()
                current=(ROOT/'VERSION.txt').read_text(encoding='utf-8-sig').strip()
                def version(value):
                    return tuple(int(part) for part in value.split()[-1].split('.'))
                self.send(200,{'current':current,'latest':latest,'available':version(latest)>version(current)})
            except (OSError,ValueError,IndexError):
                self.send(502,{'message':'Không kiểm tra được phiên bản trên GitHub.'})
            return
        if url.path in ('/_desktop/media-suggest','/_desktop/media-suggest/file'):
            if not self.server.licensing.check()['ok']:
                self.send(403,{'message':'Phiên sử dụng chưa hoạt động.'});return
            from media_suggest import download_image,download_media,search_media
            try:
                if url.path.endswith('/file'):
                    downloader=download_image if q.get('provider')==['google'] else download_media
                    data,mime=downloader(q.get('url',[''])[0])
                    self.send(200,data,mime)
                else:
                    self.send(200,search_media(q.get('q',[''])[0],q.get('kind',['image'])[0]))
            except (ArticleError,OSError,ValueError) as error:
                self.send(502,{'message':str(error)[:300]})
            return
        if url.path=='/_desktop/news-rss':
            if not self.server.licensing.check()['ok']:
                self.send(403,{'message':'Phiên sử dụng chưa hoạt động.'});return
            from news_rss import FEEDS_BY_COUNTRY,TREND_GEOS,fetch_trends,latest_news
            country=q.get('country',['Việt Nam'])[0]
            if country not in FEEDS_BY_COUNTRY:
                self.send(400,{'message':'Quốc gia không hợp lệ.'});return
            if q.get('trends')==['1']:
                try:self.send(200,{'trends':fetch_trends(TREND_GEOS[country])})
                except (OSError,ValueError):self.send(502,{'message':'Không tải được Google Trends.'})
                return
            self.send(200,latest_news(country,q.get('refresh')==['1']));return
        if url.path=='/_desktop/tin-nong':
            if not self.server.licensing.check()['ok']:
                self.send(403,{'message':'Phiên sử dụng chưa hoạt động.'});return
            try:
                with (ROOT/'data'/'tin-nong-inbox.json').open('rb') as handle:
                    raw=handle.read(1048577)
                if len(raw)>1048576:raise ValueError('Kịch bản vượt giới hạn.')
                entry=json.loads(raw)
                if isinstance(entry,dict) and isinstance(entry.get('id'),str) and 'url' in entry:
                    link=entry['url']
                    if not isinstance(link,str) or len(link)>8192:raise ValueError('Link không hợp lệ.')
                    parsed=urllib.parse.urlsplit(link)
                    if parsed.scheme not in ('http','https') or not parsed.hostname:
                        raise ValueError('Link không hợp lệ.')
                    self.send(200,{'id':entry['id'],'url':link})
                    return
                project=entry['project']
                if not isinstance(entry['id'],str) or not all(isinstance(project.get(k),str) for k in ('title','script')):
                    raise ValueError('Kịch bản không hợp lệ.')
                clean={'version':10,'title':project['title'][:120],'script':project['script'],
                       'pictures':[],'scenes':[],'captions':True,'width':1080,'studio':{'aspect':'portrait'}}
                self.send(200,{'id':entry['id'],'project':clean})
            except FileNotFoundError:
                self.send(200,{})
            except (OSError,ValueError,TypeError,KeyError,AttributeError):
                self.send(400,{'message':'Không đọc được kịch bản Tin Nóng.'})
            return
        if url.path=='/_desktop/status':
            result=self.server.licensing.check();result['contact']=self.server.contact;result['desktop_protocol']='ban-tin-desktop-v1';result['csrf']=self.server.csrf;self.send(200,result);return
        if url.path.startswith('/_desktop/article/'):
            if not self.server.licensing.check()['ok']:self.send(403,{'message':'Bản quyền chưa hoạt động.'});return
            try:
                path=url.path.removeprefix('/_desktop/article/');service=self.server.articles
                if path=='settings':self.send(200,service.config())
                elif path=='history':self.send(200,service.history())
                elif path.startswith('jobs/'):self.send(200,service.job(path.removeprefix('jobs/')))
                elif path.startswith('saved/'):self.send(200,service.article(path.removeprefix('saved/')))
                elif path.startswith('bundle/'):
                    file=service.bundle(path.removeprefix('bundle/'));self.send(200,file.read_bytes(),'application/zip')
                elif path.startswith('assets/'):
                    parts=path.split('/')
                    if len(parts)!=3:raise ArticleError('Đường dẫn ảnh không hợp lệ.')
                    file,kind=service.asset(parts[1],parts[2]);self.send(200,file.read_bytes(),kind)
                else:self.send(404,{'message':'Không tìm thấy chức năng lấy bài.'})
            except (ArticleError,OSError) as e:self.send(400,{'message':str(e)[:800]})
            return
        if url.path=='/_desktop/voice/status':
            if not self.server.licensing.check()['ok']:self.send(403,{'message':'Bản quyền chưa hoạt động.'});return
            if not self.server.voice:self.send(503,{'message':'Bộ quản lý VieNeu chưa được mở.'});return
            state=self.server.voice.ensure();state['csrf']=self.server.csrf;self.send(200,state);return
        if url.path=='/_desktop/voice/diagnostics':
            if not self.server.licensing.check()['ok']:self.send(403,{'message':'Bản quyền chưa hoạt động.'});return
            if not self.server.voice:self.send(503,{'message':'Bộ quản lý VieNeu chưa được mở.'});return
            self.send(200,self.server.voice.diagnostics());return
        if url.path.startswith('/_desktop/voice/proxy/'):
            self.voice_proxy('/'+url.path.removeprefix('/_desktop/voice/proxy/'));return
        if url.path=='/':
            boot=json.dumps({'csrf':self.server.csrf,'contact':self.server.contact,'device':getattr(self.server.licensing,'device','Bản chủ sở hữu')},ensure_ascii=False).replace('<','\\u003c')
            self.send(200,GATE.replace('BOOT_DATA',boot),'text/html; charset=utf-8');return
        if not self.server.licensing.check()['ok']:self.send(403,{'message':'Bản quyền chưa hoạt động.'});return
        target=(self.server.web/('index.html' if url.path in ('/studio','/studio/') else urllib.parse.unquote(url.path).lstrip('/'))).resolve()
        if not target.is_relative_to(self.server.web) or not target.is_file():self.send(404,'Không tìm thấy tệp.','text/plain; charset=utf-8');return
        kind=mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
        if target.suffix in ('.js','.mjs'):kind='application/javascript'
        self.send(200,target.read_bytes(),kind)
    def do_POST(self):
        if not self.boundary():return
        if not self.authenticated() or not secrets.compare_digest(self.headers.get('X-Studio-CSRF',''),self.server.csrf):self.send(403,{'message':'Phiên làm việc chưa hợp lệ.'});return
        self.server.last_seen=time.monotonic()
        if self.path.startswith('/_desktop/article/'):
            if not self.server.licensing.check()['ok']:self.send(403,{'message':'Bản quyền chưa hoạt động.'});return
            self.server.pending+=1
            try:
                n=int(self.headers.get('Content-Length','0'))
                if n<1:raise ArticleError('Yêu cầu lấy bài quá lớn.')
                body=json.loads(self.rfile.read(n));service=self.server.articles
                if not isinstance(body,dict):raise ArticleError('Yêu cầu không hợp lệ.')
                path=self.path.removeprefix('/_desktop/article/')
                if path=='import':self.send(202,service.submit(body))
                elif path=='settings':self.send(200,service.save_config(body))
                elif path in ('writer-models','writer-test'):
                    cfg=service.config(False)
                    if cfg['base_url']!='https://api.openai.com/v1':
                        raise ArticleError('Chức năng này dùng địa chỉ OpenAI mặc định.')
                    key=cfg['api_key'] or os.environ.get('OPENAI_API_KEY','').strip()
                    if not key:raise ArticleError('Hãy lưu khóa API OpenAI trước.')
                    headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'}
                    if path=='writer-models':
                        raw,_,_=service.fetch(cfg['base_url']+'/models',headers=headers,limit=2_000_000,follow_redirects=False)
                        self.send(200,{'models':sorted(item['id'] for item in json.loads(raw)['data'] if item['id'].startswith('gpt-'))})
                    else:
                        model=str(body.get('model','')).strip()
                        if not model or len(model)>160:raise ArticleError('Nhập tên model.')
                        request={'model':model,'messages':[{'role':'user','content':'Trả lời đúng một từ: OK.'}],'max_completion_tokens':128}
                        raw,_,_=service.fetch(cfg['base_url']+'/chat/completions',headers=headers,body=json.dumps(request).encode(),timeout=30,limit=100_000)
                        reply=json.loads(raw).get('choices',[{}])[0].get('message',{}).get('content')
                        if not reply:raise ArticleError('Model chưa trả về nội dung.')
                        self.send(200,{'ok':True})
                elif path=='draft':self.send(200,service.draft(body.get('id'),body))
                elif path=='save-draft':self.send(200,service.save_draft(body.get('id'),body))
                elif path=='cancel':self.send(200,service.cancel(body.get('id')))
                else:self.send(404,{'message':'Không tìm thấy chức năng lấy bài.'})
            except (ValueError,TypeError,OSError) as e:self.send(400,{'message':str(e)[:800]})
            finally:self.server.pending-=1;self.server.last_seen=time.monotonic()
            return
        if self.path=='/_desktop/github-update/install':
            if not self.server.licensing.check()['ok']:
                self.send(403,{'message':'Phiên sử dụng chưa hoạt động.'});return
            if getattr(self.server,'github_update_running',False):
                self.send(409,{'message':'Đang cập nhật.'});return
            self.server.github_update_running=True
            try:
                from github_update import prepare_update
                prepare_update(ROOT)
            except Exception as error:
                self.server.github_update_running=False
                self.send(502,{'message':f'Cập nhật thất bại: {error}'});return
            try:
                self.send(200,{'ok':True})
            finally:
                threading.Thread(target=self.server.shutdown,daemon=True).start()
            return
        if self.path=='/_desktop/media-suggest/google':
            if not self.server.licensing.check()['ok']:
                self.send(403,{'message':'Phiên sử dụng chưa hoạt động.'});return
            from media_suggest import google_images
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4096:raise ValueError('Yêu cầu tìm ảnh không hợp lệ.')
                body=json.loads(self.rfile.read(length))
                self.send(200,google_images(body.get('q')))
            except (ArticleError,OSError,ValueError,AttributeError) as error:
                self.send(502,{'message':str(error)[:300]})
            return
        if self.path=='/_desktop/quit':
            self.send(200,{'ok':True});threading.Thread(target=self.server.shutdown,daemon=True).start();return
        if self.path in ('/_desktop/voice/setup','/_desktop/voice/reconnect'):
            if not self.server.licensing.check()['ok']:self.send(403,{'message':'Bản quyền chưa hoạt động.'});return
            if not self.server.voice:self.send(503,{'message':'Bộ quản lý VieNeu chưa được mở.'});return
            self.send(202,self.server.voice.ensure(setup=self.path.endswith('/setup'),retry=self.path.endswith('/reconnect')));return
        if self.path.startswith('/_desktop/voice/proxy/'):
            try:
                n=int(self.headers.get('Content-Length','0'))
                if n<0 or n>11_000_000:raise ValueError('Âm thanh quá lớn.')
                self.voice_proxy('/'+self.path.removeprefix('/_desktop/voice/proxy/'),self.rfile.read(n),self.headers.get('Content-Type'))
            except ValueError as e:self.send(400,{'detail':str(e)})
            return
        if self.path!='/_desktop/activate':self.send(404,{'message':'Không tìm thấy.'});return
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<1 or n>2048:raise ValueError('Yêu cầu quá lớn.')
            body=json.loads(self.rfile.read(n));state=self.server.licensing.activate(body.get('key',''));self.send(200,state)
        except (ValueError,TypeError,LicenseError) as e:self.send(400,{'message':str(e)})

    def voice_proxy(self,path,body=None,content_type=None):
        if not self.server.licensing.check()['ok']:self.send(403,{'detail':'Bản quyền chưa hoạt động.'});return
        if not self.server.voice:self.send(503,{'detail':'Bộ quản lý VieNeu chưa được mở.'});return
        try:
            self.server.pending+=1
            try:code,data,kind=self.server.voice.proxy(path,body,content_type);self.send(code,data,kind)
            finally:self.server.pending-=1;self.server.last_seen=time.monotonic()
        except VoiceError as e:self.send(503,{'detail':str(e)})

def open_browser(url,root=None):
    root=Path(root or ROOT)
    if os.name=='nt':
        candidates=[Path(os.environ.get('PROGRAMFILES','C:/Program Files'))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)','C:/Program Files (x86)'))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('LOCALAPPDATA',''))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)','C:/Program Files (x86)'))/'Microsoft/Edge/Application/msedge.exe',Path(os.environ.get('PROGRAMFILES','C:/Program Files'))/'Microsoft/Edge/Application/msedge.exe',Path(os.environ.get('LOCALAPPDATA',''))/'Microsoft/Edge/Application/msedge.exe']
        for exe in candidates:
            if exe.is_file():subprocess.Popen(browser_command(exe,url,root),env=environment(root),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);return
        raise RuntimeError('Cần Chrome hoặc Edge để mở cửa sổ Quân Bản Tin. Cài trình duyệt rồi mở lại file EXE.')
    webbrowser.open(url)

def reopen_existing(data,port,root=None):
    state=read_json(Path(data)/'desktop-session.json')
    if state.get('port')!=port or not isinstance(state.get('token'),str):return False
    try:
        request=urllib.request.Request(f'http://127.0.0.1:{port}/_desktop/status',headers={'Cookie':f'bts_session_{port}='+state['token']+'; bts_session='+state['token']})
        with urllib.request.urlopen(request,timeout=12) as response:
            if json.loads(response.read(16384)).get('desktop_protocol')!='ban-tin-desktop-v1':return False
        open_browser(f'http://127.0.0.1:{port}/?launch='+state.get('launch_key',state['token']),root=root);return True
    except (OSError,ValueError):return False

def window_idle(server,now=None):
    worker=server.voice and server.voice.thread and server.voice.thread.is_alive()
    return (time.monotonic() if now is None else now)-server.last_seen>180 and not server.pending and not worker

def watch_window(server):
    while True:
        time.sleep(10)
        if window_idle(server):server.shutdown();return

def run(license_object=None,port=8789):
    data=storage(ROOT)/('owner' if license_object else 'client');data.mkdir(exist_ok=True)
    with desktop_lock(data) as acquired:
        if not acquired:
            for _ in range(20):
                if reopen_existing(data,port,root=ROOT):return
                time.sleep(.15)
            raise RuntimeError('Quân Bản Tin đang khởi động hoặc đang đóng. Chờ vài giây rồi mở lại file EXE; không cần xóa data hoặc cài lại mô hình.')
        return run_locked(license_object,port)

def run_locked(license_object=None,port=8789):
    config=json.loads((ROOT/'client-config.json').read_text(encoding='utf-8')) if (ROOT/'client-config.json').exists() else {}
    try:
        data=storage(ROOT)/('owner' if license_object else 'client');data.mkdir(exist_ok=True);migrate_client(data,owner=license_object is not None)
        if reopen_existing(data,port,root=ROOT):return
        licence=license_object or RemoteLicense(config.get('server_url',''),data)
        voice=VoiceManager(ROOT,origin=f'http://127.0.0.1:{port}')
        server=LocalApp(('127.0.0.1',port),licence,ROOT/'web',config.get('contact','Người bán tool'),voice=voice,launch_key=launch_secret(data))
    except (OSError,LicenseError) as e:
        if 'data' in locals() and reopen_existing(data,port,root=ROOT):return
        raise RuntimeError('Không mở được Quân Bản Tin: '+str(e)+' Đóng phiên cũ trước khi cập nhật. Nếu là bản khách, nhờ người bán tạo gói có địa chỉ máy chủ.') from e
    write_json(data/'desktop-session.json',{'port':port,'token':server.token,'launch_key':server.launch_key})
    try:os.chmod(data/'desktop-session.json',0o600)
    except OSError:pass
    print(f'QUÂN BẢN TIN — Đang chạy trên máy này, cổng {port}.');print('Dữ liệu portable:',ROOT/'data');print('Giữ cửa sổ này mở khi sử dụng. Đóng cửa sổ để dừng bộ chạy.')
    def launch():
        try:open_browser(f'http://127.0.0.1:{port}/?launch={server.launch_key}')
        except Exception as error:
            print('Không mở được cửa sổ:',error)
            if os.name=='nt':
                import ctypes
                ctypes.windll.user32.MessageBoxW(None,str(error),'Quân Bản Tin',0x10)
            server.shutdown()
    threading.Timer(.4,launch).start()
    if os.environ.get('BTS_DESKTOP_GUI')=='1':threading.Thread(target=watch_window,args=(server,),daemon=True).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        server.server_close()
        if read_json(data/'desktop-session.json').get('token')==server.token:(data/'desktop-session.json').unlink(missing_ok=True)

if __name__=='__main__':run()
