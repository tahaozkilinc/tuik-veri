"""Geçici keşif scripti #3 — form yapısı (date input'un etrafı), script
dosyası listesi (turib-api altındaki JS'ler), ve "seans"/"lidaş"/"mısır"
metin geçişleri."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}

def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")

html = fetch("https://www.turib.com.tr/gunluk-bulten/")
print("total length:", len(html))

idx = html.find('getbulletin_date')
print("\n--- 2500 chars around getbulletin_date input ---")
print(html[max(0, idx-1200):idx+1300])

print("\n--- all <script src=...> URLs ---")
for m in re.finditer(r'<script[^>]*\bsrc=["\']([^"\']+)["\']', html):
    print(m.group(1))

print("\n--- all <form ...> tags ---")
for m in re.finditer(r'<form[^>]*>', html):
    print(m.group(0))

print("\n--- occurrences of seans/lidas/misir/mısır (with 80 chars context) ---")
for m in re.finditer(r'.{0,80}(seans|lidas|lid[aA]ş|m[ıi]s[ıi]r).{0,80}', html, re.I):
    print(repr(m.group(0)))
    print("---")
