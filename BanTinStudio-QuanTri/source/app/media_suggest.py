"""Search Wikimedia Commons and import supported files."""
import json
from urllib.parse import urlencode, urlsplit
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

def google_images(query, key):
    if not isinstance(query,str) or not query.strip() or len(query)>180:
        raise ArticleError('Nhập từ khóa từ 1 đến 180 ký tự.')
    if not isinstance(key,str) or not key.strip() or len(key)>256 or any(c in key for c in '\r\n'):
        raise ArticleError('Nhập khóa API Serper để tìm Google Hình ảnh.')
    body=json.dumps({'q':query.strip(),'gl':'vn','hl':'vi','num':16}).encode()
    raw,_,_=fetch_public('https://google.serper.dev/images',limit=2_000_000,body=body,
                         headers={'X-API-KEY':key.strip(),'Content-Type':'application/json'})
    results=[]
    seen=set()
    for item in json.loads(raw).get('images',[])[:16]:
        url=item.get('imageUrl','')
        page=item.get('link','')
        thumb=item.get('thumbnailUrl','')
        if not public_web_url(url) or not public_web_url(page) or url in seen:
            continue
        seen.add(url)
        results.append({'title':str(item.get('title') or 'Ảnh Google')[:180],'url':url,
                        'page':page,'thumb':thumb if public_web_url(thumb) else '',
                        'license':'','mime':'image/*','size':0})
    return results

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
