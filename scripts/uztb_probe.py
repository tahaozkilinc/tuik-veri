"""Geçici keşif scripti #5 — gunlukbulten sayfasında 'veri' değişkeninin
tanımını (muhtemelen sunucu tarafında gömülü JSON) bulur."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
BASE = "https://www.uzunkoprutb.org.tr"


def fetch(url, headers=None, encoding="iso-8859-9"):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        return raw.decode(encoding, errors="replace"), raw


html, _ = fetch(BASE + "/sayfa.asp?tur=gunlukbulten&tarih=01.10.2026&urun=99992")
print("page length:", len(html))

print("\n--- 'var veri' or 'veri =' or 'veri=' occurrences (context 400 chars) ---")
for m in re.finditer(r'.{0,80}\bveri\s*=\s*.{0,400}', html):
    print(repr(m.group(0)))
    print("-----")

print("\n--- select/option tags (product/date pickers) ---")
for m in re.finditer(r'<select[^>]*>.{0,1500}?</select>', html, re.S):
    print(m.group(0)[:1600])
    print("=====")

print("\n--- all <script> block START lines (first 150 chars of each inline script) ---")
for m in re.finditer(r'<script(?![^>]*src)[^>]*>(.{0,150})', html, re.S):
    print(repr(m.group(1)))
    print("---")

print("\n--- full page dump from first occurrence of 'MaxFiyat' minus 3000 to plus 500 ---")
idx = html.find("MaxFiyat")
if idx >= 0:
    print(html[max(0, idx-3000):idx+500])
else:
    print("MaxFiyat not found in this fetch")
