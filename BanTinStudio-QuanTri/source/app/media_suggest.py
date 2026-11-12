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
