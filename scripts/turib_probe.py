"""Geçici keşif scripti #4 — bir tarih POST'layıp dönen bülten tablosunun
yapısını (sekmeler, sütun başlıkları, örnek satırlar) inceler."""
import re
import urllib.request
import urllib.parse

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
}

URL = "https://www.turib.com.tr/gunluk-bulten/"


def post(url, data, headers=None):
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers or HEADERS, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


html = post(URL, {"getbulletin_date": "2026-10-13", "submit": "Listele"})
print("total length:", len(html))

print("\n--- nav-tabs (all tab button texts + ids) ---")
for m in re.finditer(r'<a[^>]*(?:id|href)="#?([\w-]*)"[^>]*role="tab"[^>]*>(.*?)</a>', html):
    print(m.group(1), "|", re.sub(r"<[^>]+>", "", m.group(2)).strip())

print("\n--- all tab-pane divs (id + first 300 chars) ---")
for m in re.finditer(r'<div[^>]*class="[^"]*tab-pane[^"]*"[^>]*id="([\w-]+)"[^>]*>', html):
    start = m.end()
    print(m.group(1), "::", html[start:start + 300].replace("\n", " "))
    print("---")

print("\n--- all <table> blocks: headers + first 3 rows ---")
for tm in re.finditer(r'<table[^>]*>(.*?)</table>', html, re.S):
    tbl = tm.group(0)
    print("TABLE tag:", re.match(r'<table[^>]*>', tbl).group(0))
    headers = re.findall(r'<th[^>]*>(.*?)</th>', tbl, re.S)
    print("headers:", [re.sub(r'<[^>]+>', '', h).strip() for h in headers])
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbl, re.S)
    for r in rows[:4]:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)
        if cells:
            print("row:", [re.sub(r'<[^>]+>', '', c).strip() for c in cells])
    print("=====")

print("\n--- total length check: how different from GET (no date) ---")
base = get(URL)
print("GET length:", len(base), "POST length:", len(html))
