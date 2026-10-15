"""Geçici keşif scripti #2 — ssdetay (ürün detay) sayfasının AJAX çağrısını,
tarih/filtre formunu ve tablo yapısını bulur."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
URL = "https://www.uzunkoprutb.org.tr/sayfa.asp?tur=ssdetay&urun=99992"


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("iso-8859-9", errors="replace")


html = fetch(URL)
print("total length:", len(html))

print("\n--- all $.ajax( blocks (800 chars each) ---")
count = 0
for m in re.finditer(r'\$\.ajax\(\s*\{.{0,900}?\}\s*\)\s*;', html, re.S):
    print(m.group(0))
    print("=====")
    count += 1
if count == 0:
    # fallback: find $.ajax( and print 1000 chars after
    for m in re.finditer(r'\$\.ajax\(', html):
        start = m.start()
        print(html[start:start+1000])
        print("=====")

print("\n--- context around table-list ss (2000 chars before/after) ---")
idx = html.find("table-list ss")
if idx >= 0:
    print(html[max(0, idx-1500):idx+2000])

print("\n--- all <script src=...> local (non-cdn) files ---")
for m in re.finditer(r'<script[^>]*\bsrc="([^"]+)"', html):
    src = m.group(1)
    if src.startswith("scripts/") or src.startswith("/scripts/"):
        print(src)

print("\n--- occurrences of 'cekirdek' or 'rutubet' or 'miktar' (context) ---")
for m in re.finditer(r'.{0,60}(cekirdek|çekirdek|rutubet|miktar|tarih).{0,60}', html, re.I):
    print(repr(m.group(0)))
