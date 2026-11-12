"""RSS sources for the Tin Nóng step."""
from concurrent.futures import ThreadPoolExecutor
import email.utils
import time
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
from article_import import fetch_public

FEEDS = {
    'VnExpress': 'https://vnexpress.net/rss/tin-moi-nhat.rss',
    'Tuổi Trẻ': 'https://tuoitre.vn/rss/tin-moi-nhat.rss',
    'VietNamNet': 'https://vietnamnet.vn/home.rss',
    'Người Đưa Tin': 'https://www.nguoiduatin.vn/trang-chu.rss',
    'Kenh14': 'https://kenh14.vn/rss/home.rss',
    'Thanh Niên': 'https://thanhnien.vn/rss/home.rss',
}
_cache = None

def read_feed(source, url):
    raw, _, _ = fetch_public(url, limit=2_000_000, timeout=7)
    rows = []
    for item in ET.fromstring(raw).findall('./channel/item')[:35]:
        title = (item.findtext('title') or '').strip()
        link = (item.findtext('link') or '').strip()
        parsed = urlsplit(link)
        if not title or parsed.scheme not in ('http', 'https') or not parsed.hostname:
            continue
        published = (item.findtext('pubDate') or '').strip()
        try:
            stamp = email.utils.parsedate_to_datetime(published).timestamp()
        except (TypeError, ValueError, OverflowError):
            stamp = 0
        rows.append({'title': title, 'url': link, 'source': source, 'stamp': stamp})
    return rows

def latest_news(refresh=False):
    global _cache
    if not refresh and _cache and time.monotonic() - _cache[0] < 300:
        return _cache[1]
    rows, failed = [], []
    with ThreadPoolExecutor(max_workers=len(FEEDS)) as pool:
        tasks = {source: pool.submit(read_feed, source, url) for source, url in FEEDS.items()}
        for source, task in tasks.items():
            try:
                rows.extend(task.result())
            except Exception:
                failed.append(source)
    rows.sort(key=lambda row: row['stamp'], reverse=True)
    unique = {}
    for row in rows:
        unique.setdefault(row['url'].split('?')[0], row)
    result = {'articles': list(unique.values()), 'failed': failed}
    if rows:
        _cache = time.monotonic(), result
    return result
