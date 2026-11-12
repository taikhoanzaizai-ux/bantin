"""Search Wikimedia Commons and import supported files."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import re
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlencode, urlsplit
from article_import import ArticleError, fetch_public

TYPES = {'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp',
         'video/webm':'.webm','video/mp4':'.mp4'}

def media_url(value):
    url = urlsplit(value)
    return url.scheme == 'https' and url.netloc == 'upload.wikimedia.org' and url.path.startswith('/wikipedia/commons/')

def search_media(query, kind):
    query = query.strip()
    if not query or len(query) > 180 or kind not in ('image','video'):
        raise ArticleError('Nhập từ khóa từ 1 đến 180 ký tự và chọn loại tư liệu.')
    params = {'action':'query','generator':'search','gsrnamespace':6,'gsrlimit':16,
              'gsrsearch':query + (' filetype:video' if kind == 'video' else ' filetype:bitmap'),
              'prop':'imageinfo','iiprop':'url|mime|extmetadata|size','iiurlwidth':320,'format':'json'}
    raw, _, _ = fetch_public('https://commons.wikimedia.org/w/api.php?' + urlencode(params), limit=2_000_000)
    pages = json.loads(raw).get('query', {}).get('pages', {}).values()
    results = []
    for page in sorted(pages, key=lambda row: row.get('index', 99)):
        info = (page.get('imageinfo') or [{}])[0]
        mime = info.get('mime', '')
        url = info.get('url', '')
        if mime not in TYPES or not mime.startswith(kind+'/') or not media_url(url):
            continue
        metadata = info.get('extmetadata', {})
        thumb = info.get('thumburl', '')
        results.append({'title':page['title'].removeprefix('File:'),'url':url,
                        'page':'https://commons.wikimedia.org/?curid='+str(page['pageid']),
                        'thumb':thumb if media_url(thumb) else '',
                        'license':metadata.get('LicenseShortName', {}).get('value', ''),
                        'mime':mime,'size':info.get('size',0)})
    return results

def download_media(url):
    if not media_url(url):
        raise ArticleError('Chỉ hỗ trợ tệp Wikimedia Commons.')
    body, headers, final = fetch_public(url, limit=30_000_000, timeout=30)
    mime = headers.get('content-type','').split(';')[0].strip().lower()
    if not media_url(final) or mime not in TYPES or not body:
        raise ArticleError('Tệp không đúng định dạng được hỗ trợ.')
    if mime.startswith('image/') and len(body) > 15_000_000:
        raise ArticleError('Ảnh vượt 15 MB.')
    return body, mime

class GoogleImagesParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results = []
        self.link = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'a':
            href = values.get('href') or ''
            try:
                parsed = urlsplit(href)
                params = parse_qs(parsed.query)
                self.link = params if parsed.path == '/imgres' else None
            except ValueError:
                self.link = None
        if tag != 'img':
            return
        candidates = [values.get('data-src'), values.get('src')]
        thumb = next((u for u in candidates if google_thumbnail(u)), '')
        params = self.link or {}
        url = params.get('imgurl', [''])[0]
        page = params.get('imgrefurl', [''])[0]
        if not public_web_url(url):
            url = thumb
        if not url:
            return
        self.results.append({'url':url, 'thumb':thumb, 'page':page if public_web_url(page) else '',
                             'title':(values.get('alt') or 'Ảnh Google')[:180], 'thumbnail_only':url==thumb,
                             'license':'', 'mime':'image/*', 'size':0})

    def handle_endtag(self, tag):
        if tag == 'a':
            self.link = None

def google_thumbnail(value):
    if not public_web_url(value):
        return False
    parsed = urlsplit(value)
    return parsed.scheme == 'https' and bool(re.fullmatch(r'encrypted-tbn\d*\.gstatic\.com',parsed.hostname or ''))

def render_google_page(url):
    roots = (os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramFiles'), 'C:/Program Files (x86)', 'C:/Program Files')
    edge = next((Path(root)/'Microsoft/Edge/Application/msedge.exe' for root in roots
                 if root and (Path(root)/'Microsoft/Edge/Application/msedge.exe').is_file()), None)
    if edge is None:
        raise ArticleError('Cần Microsoft Edge để hiển thị kết quả Google trong Quân Bản Tin.')
    profile = tempfile.mkdtemp(prefix='qbt-google-')
    try:
        result = subprocess.run([str(edge),'--headless','--disable-gpu','--no-first-run',
                                 '--user-data-dir='+profile,'--dump-dom','--virtual-time-budget=5000',url],
                                stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=25,
                                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        if result.returncode or len(result.stdout)>12_000_000:
            raise ArticleError('Không hiển thị được trang kết quả Google.')
        return result.stdout
    except subprocess.TimeoutExpired:
        raise ArticleError('Google phản hồi quá lâu. Hãy thử lại.') from None
    finally:
        shutil.rmtree(profile,ignore_errors=True)

def google_images(query):
    if not isinstance(query,str) or not query.strip() or len(query)>180:
        raise ArticleError('Nhập từ khóa từ 1 đến 180 ký tự.')
    params = urlencode({'q':query.strip(),'udm':'2','hl':'vi'})
    raw = render_google_page('https://www.google.com/search?' + params)
    parser = GoogleImagesParser()
    parser.feed(raw.decode('utf-8', errors='replace'))
    unique = {}
    for item in parser.results:
        unique.setdefault(item['url'],item)
    if not unique:
        raise ArticleError('Không đọc được ảnh từ trang Google. Hãy thử Wikimedia Commons.')
    return list(unique.values())[:20]

def public_web_url(value):
    if not isinstance(value,str) or len(value)>8192:
        return False
    try:
        url=urlsplit(value)
        return url.scheme in ('http','https') and bool(url.hostname) and not url.username and not url.password
    except ValueError:
        return False

def download_image(url):
    if not public_web_url(url):
        raise ArticleError('Địa chỉ ảnh không hợp lệ.')
    body, headers, _ = fetch_public(url,limit=15_000_000,timeout=15)
    mime=headers.get('content-type','').split(';')[0].strip().lower()
    valid = ((mime == 'image/jpeg' and body.startswith(b'\xff\xd8\xff')) or
             (mime == 'image/png' and body.startswith(b'\x89PNG\r\n\x1a\n')) or
             (mime == 'image/webp' and body[:4] == b'RIFF' and body[8:12] == b'WEBP'))
    if not valid:
        raise ArticleError('Ảnh gốc cần có định dạng JPG, PNG hoặc WebP.')
    return body,mime
