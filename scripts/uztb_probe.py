"""Geçici keşif scripti #4 — gunlukbulten sayfasındaki asıl AJAX çağrısını
(veri değişkenini dolduran) ve tarih/ürün parametrelerini bulur."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
BASE = "https://www.uzunkoprutb.org.tr"


def fetch(url, headers=None, encoding="iso-8859-9"):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        return raw.decode(encoding, errors="replace"), raw


print("--- gunlukbulten?tarih=01.10.2026 full ajax blocks ---")
html, _ = fetch(BASE + "/sayfa.asp?tur=gunlukbulten&tarih=01.10.2026")
print("page length:", len(html))
for m in re.finditer(r'\$\.ajax\(\s*\{.{0,1200}?\}\s*\)\s*;', html, re.S):
    print(m.group(0))
    print("=====")

print("\n--- gunlukbulten WITHOUT tarih param (default) ---")
html2, _ = fetch(BASE + "/sayfa.asp?tur=gunlukbulten")
print("page length:", len(html2))
for m in re.finditer(r'\$\.ajax\(\s*\{.{0,1200}?\}\s*\)\s*;', html2, re.S):
    print(m.group(0))
    print("=====")

print("\n--- any url: \"...\" occurrences in gunlukbulten page (api endpoints) ---")
for m in re.finditer(r'url\s*:\s*"([^"]+)"', html):
    print(m.group(1))

print("\n--- gunlukbulten?tarih=X&urun=99992 (product-scoped?) ---")
html3, _ = fetch(BASE + "/sayfa.asp?tur=gunlukbulten&tarih=01.10.2026&urun=99992")
print("page length:", len(html3))
for m in re.finditer(r'url\s*:\s*"([^"]+)"', html3):
    print(m.group(1))

print("\n--- try candidate api/gunluk*.php endpoints directly ---")
for candidate in [
    "/api/gunluk-ozet.php?mkod=99992",
    "/api/gunluk-bulten.php?mkod=99992",
    "/api/gunlukbulten.php?mkod=99992&tarih=01.10.2026",
    "/api/salon-satis-ozet.php?mkod=99992",
    "/api/fiyat-gecmisi.php?mkod=99992",
]:
    try:
        t, _ = fetch(BASE + candidate, encoding="utf-8")
        print(candidate, "-> length:", len(t), "preview:", t[:200])
    except Exception as e:
        print(candidate, "-> ERROR:", e)
