"""Geçici keşif scripti #3 — gerçek API endpoint'ini (/api/salon-satis.php)
doğrudan çağırır, mkod değişkeninin tanımını bulur, tarih parametresi
deneyip geçmiş veri alınıp alınamadığını test eder."""
import json
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
BASE = "https://www.uzunkoprutb.org.tr"
PAGE_URL = BASE + "/sayfa.asp?tur=ssdetay&urun=99992"


def fetch(url, headers=None, encoding="iso-8859-9"):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        return raw.decode(encoding, errors="replace"), raw


html, _ = fetch(PAGE_URL)

print("--- mkod definition ---")
for m in re.finditer(r'.{0,50}\bmkod\s*=\s*[^;]{1,80};', html):
    print(repr(m.group(0)))

print("\n--- full yukleSalonSatis function (first 6000 chars from its start) ---")
idx = html.find("function yukleSalonSatis")
if idx >= 0:
    print(html[idx:idx + 6000])

print("\n\n--- direct API call: /api/salon-satis.php?mkod=99992 ---")
try:
    text, raw = fetch(BASE + "/api/salon-satis.php?mkod=99992", encoding="utf-8")
    print("length:", len(text))
    print(text[:3000])
except Exception as e:
    print("ERROR:", e)

print("\n--- direct API call with tarih param: ?mkod=99992&tarih=01.10.2026 ---")
try:
    text2, _ = fetch(BASE + "/api/salon-satis.php?mkod=99992&tarih=01.10.2026", encoding="utf-8")
    print("length:", len(text2))
    print(text2[:2000])
except Exception as e:
    print("ERROR:", e)

print("\n--- gunlukbulten page (fallback for backfill?) ---")
try:
    gb, _ = fetch(BASE + "/sayfa.asp?tur=gunlukbulten&tarih=01.10.2026")
    print("length:", len(gb))
    idx2 = gb.find("table")
    print(gb[max(0, idx2 - 500):idx2 + 2000] if idx2 >= 0 else gb[:2000])
except Exception as e:
    print("ERROR:", e)
