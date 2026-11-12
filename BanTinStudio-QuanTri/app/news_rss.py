import datetime as dt
import email.utils
import math
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from article_import import fetch_public

TREND_GEOS = {"Việt Nam": "VN", "Mỹ": "US", "Hàn Quốc": "KR", "Nhật Bản": "JP"}
TREND_URL = "https://trends.google.com/trending"
def parse_trends(raw):
    root = ET.fromstring(raw)
    if root.tag != "rss":
        raise ValueError("Phản hồi Google Trends không phải RSS")
    rows = []
    for item in root.findall("./channel/item"):
        keyword = (item.findtext("title") or "").strip()
        if not keyword:
            continue
        traffic = (item.findtext("{*}approx_traffic") or "").strip()
        match = re.fullmatch(r"([\d,.\s]+)\s*([KMB]?)\+?", traffic, re.I)
        count = -1
        if match:
            digits, unit = match.groups()
            digits = "".join(digits.split())
            multiplier = {"K": 1000, "M": 1000000, "B": 1000000000}.get(unit.upper())
            try:
                count = int(float(digits.replace(",", ".")) * multiplier) if multiplier else int(re.sub(r"\D", "", digits))
            except (ValueError, OverflowError):
                pass
        articles = []
        for article in item.findall("{*}news_item"):
            url = (article.findtext("{*}news_item_url") or "").strip()
            title = (article.findtext("{*}news_item_title") or "").strip()
            parsed = urlsplit(url)
            if title and parsed.scheme in ("https", "http") and parsed.hostname:
                articles.append((title, url))
        rows.append((count, traffic, keyword, articles))
    return sorted(rows, key=lambda row: row[0], reverse=True)


def fetch_trends(geo):
    request = urllib.request.Request(f"{TREND_URL}/rss?geo={geo}", headers={"User-Agent": "TinNongRSS/2.2"})
    with urllib.request.urlopen(request, timeout=10) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("RSS Google Trends quá lớn")
    return parse_trends(raw)


VIETNAM_FEEDS = [
    ("VnExpress", "Thời sự", "https://vnexpress.net/rss/thoi-su.rss"),
    ("VnExpress", "Đời sống", "https://vnexpress.net/rss/doi-song.rss"),
    ("VnExpress", "Pháp luật", "https://vnexpress.net/rss/phap-luat.rss"),
    ("VnExpress", "Thể thao", "https://vnexpress.net/rss/the-thao.rss"),
    ("Tuổi Trẻ", "Tin chung", "https://tuoitre.vn/rss/tin-moi-nhat.rss"),
    ("Thanh Niên", "Tin chung", "https://thanhnien.vn/rss/home.rss"),
    ("Dân trí", "Tin chung", "https://dantri.com.vn/rss/trangchinh.rss"),
    ("Kenh14", "Giải trí", "https://kenh14.vn/rss/home.rss"),
    ("VietNamNet", "Tin chung", "https://vietnamnet.vn/home.rss"),
    ("Tiền Phong", "Tin chung", "https://tienphong.vn/rss/home.rss"),
    ("Nhân Dân", "Tin chung", "https://nhandan.vn/rss/home.rss"),
    ("Người Đưa Tin", "Tin chung", "https://www.nguoiduatin.vn/trang-chu.rss"),
    ("VOV qua Google News", "Tin chung", "https://news.google.com/rss/search?q=site%3Avov.vn+when%3A2d&hl=vi&gl=VN&ceid=VN%3Avi"),
    ("VTC News", "Tin chung", "https://vtcnews.vn/rss/trang-chu.rss"),
    ("24h", "Tin chung", "https://www.24h.com.vn/upload/rss/trangchu24h.rss"),
]
FEEDS_BY_COUNTRY = {
    "Việt Nam": VIETNAM_FEEDS,
    "Mỹ": [
        ("ABC News", "Tin chung", "https://abcnews.go.com/abcnews/usheadlines"),
        ("NPR", "Tin chung", "https://feeds.npr.org/1001/rss.xml"),
    ],
    "Hàn Quốc": [
        ("Yonhap", "Tin chung", "https://en.yna.co.kr/RSS/national.xml"),
    ],
    "Nhật Bản": [
        ("NHK World", "Tin chung", "https://www3.nhk.or.jp/nhkworld/en/news/rss/all.xml"),
    ],
}
TOPICS = ("Tất cả", "Thời sự", "Đời sống", "Pháp luật", "Thể thao", "Giải trí", "Tin chung")
IGNORE = set("và của có ở là cho khi với một những các đã được từ về trong tại sau trước trên này".split())


def read_feed(feed):
    source, topic, url = feed
    raw, _, _ = fetch_public(url, limit=2_000_000, timeout=8)
    if len(raw) > 2_000_000:
        raise ValueError("RSS quá lớn")
    root = ET.fromstring(raw)
    if root.tag != "rss":
        raise ValueError("Định dạng RSS không hợp lệ")
    rows = []
    for item in root.findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        parsed = urlsplit(link)
        if not title or parsed.scheme not in ("http", "https") or not parsed.hostname:
            continue
        try:
            date = email.utils.parsedate_to_datetime(item.findtext("pubDate") or "")
            date = date.replace(tzinfo=dt.timezone.utc) if date.tzinfo is None else date
        except (ValueError, TypeError, OverflowError):
            continue
        rows.append((title, link, date, source, topic))
    return rows


def rank(rows, now):
    unique = {}
    for row in rows:
        key = row[1].split("?")[0].rstrip("/")
        if key not in unique:
            unique[key] = row
    groups = []
    for row in sorted(unique.values(), key=lambda r: r[2], reverse=True):
        age = (now - row[2]).total_seconds() / 3600
        if age > 48 or age < -1:
            continue
        words = set(re.findall(r"\w+", row[0].casefold())) - IGNORE
        for group in groups:
            anchor, items = group
            common = len(words & anchor)
            if common >= 4 and common / len(words | anchor) >= 0.52:
                items.append(row)
                break
        else:
            groups.append((words, [row]))
    ranked = []
    for _, items in groups:
        age = max(0, (now - items[0][2]).total_seconds() / 3600)
        sources = len({r[3] for r in items})
        score = round(65 * math.exp(-age / 12) + min(35, 14 * (sources - 1)))
        ranked.append((score, sources, items))
    return sorted(ranked, key=lambda g: (g[0], g[2][0][2]), reverse=True)



_cache = {}

def latest_news(country, refresh=False):
    feeds = FEEDS_BY_COUNTRY[country]
    cached = _cache.get(country)
    if cached and not refresh and time.monotonic() - cached[0] < 300:
        return cached[1]
    rows, failed = [], []
    with ThreadPoolExecutor(max_workers=len(feeds)) as pool:
        for feed, task in zip(feeds, [pool.submit(read_feed, feed) for feed in feeds]):
            try:
                rows.extend(task.result())
            except Exception:
                failed.append(f'{feed[0]} / {feed[1]}')
    groups = rank(rows, dt.datetime.now(dt.timezone.utc))
    result = {'groups': [
        {'score': score, 'sources': count, 'items': [
            {'title': title, 'url': url, 'stamp': date.timestamp(), 'source': source, 'topic': topic}
            for title, url, date, source, topic in items
        ]} for score, count, items in groups
    ], 'failed': failed, 'total': len(feeds)}
    if rows:
        _cache[country] = time.monotonic(), result
    return result
