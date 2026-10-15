"""Geçici keşif scripti #5 — NORMAL SEANS tablosundaki tüm benzersiz
Enstrüman Sınıfı (ürün) ve LİDAŞ Adı değerlerini çıkarır; MISIR'ın tam
yazımını doğrular."""
import re
import urllib.request
import urllib.parse

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
}
URL = "https://www.turib.com.tr/gunluk-bulten/"


def post(url, data):
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def extract_tab_table(html, tab_id):
    m = re.search(r'<div[^>]*class="[^"]*tab-pane[^"]*"[^>]*id="' + tab_id + r'"[^>]*>(.*?)(?=<div[^>]*class="[^"]*tab-pane|\Z)', html, re.S)
    if not m:
        return None
    block = m.group(1)
    tm = re.search(r'<table[^>]*>(.*?)</table>', block, re.S)
    return tm.group(0) if tm else None


def parse_table(tbl_html):
    headers = [re.sub(r'<[^>]+>', '', h).strip() for h in re.findall(r'<th[^>]*>(.*?)</th>', tbl_html, re.S)]
    rows = []
    for rm in re.finditer(r'<tr[^>]*>(.*?)</tr>', tbl_html, re.S):
        cells = re.findall(r'<td[^>]*>(.*?)</td>', rm.group(1), re.S)
        if cells:
            rows.append([re.sub(r'<[^>]+>', '', c).strip() for c in cells])
    return headers, rows


for date in ["2026-10-13", "2026-09-15"]:
    html = post(URL, {"getbulletin_date": date, "submit": "Listele"})
    tbl = extract_tab_table(html, "nav-home")
    headers, rows = parse_table(tbl)
    print(f"\n=== date={date} NORMAL SEANS: {len(rows)} rows ===")
    print("headers:", headers)
    enstruman_idx = headers.index("Enstrüman Sınıfı") if "Enstrüman Sınıfı" in headers else None
    lidas_idx = headers.index("LİDAŞ Adı") if "LİDAŞ Adı" in headers else None
    if enstruman_idx is not None:
        uniq = sorted(set(r[enstruman_idx] for r in rows if len(r) > enstruman_idx))
        print("unique Enstrüman Sınıfı:", uniq)
    if lidas_idx is not None:
        uniq_l = sorted(set(r[lidas_idx] for r in rows if len(r) > lidas_idx))
        print(f"unique LİDAŞ count: {len(uniq_l)}")
        for l in uniq_l[:15]:
            print("  -", l)

    misir_rows = [r for r in rows if enstruman_idx is not None and len(r) > enstruman_idx and "MISIR" in r[enstruman_idx].upper()]
    print(f"MISIR rows found: {len(misir_rows)}")
    for r in misir_rows[:3]:
        print(" sample:", r)
