"""Geçici keşif scripti #2 — form alanlarını (tarih, seans, ürün, LİDAŞ),
AJAX endpoint'lerini ve tablo yapısını bulur."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}

def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")

html = fetch("https://www.turib.com.tr/gunluk-bulten/")
print("total length:", len(html))

print("\n--- select/option blocks (truncated) ---")
for m in re.finditer(r'<select[^>]*>.{0,1500}?</select>', html, re.S):
    print(m.group(0)[:1600])
    print("---")

print("\n--- input fields (date etc) ---")
for m in re.finditer(r'<input[^>]*>', html):
    s = m.group(0)
    if re.search(r'date|tarih|session|seans|urun|product|lidas|depo', s, re.I):
        print(s)

print("\n--- ajax/admin-ajax/wp_ajax hints ---")
for m in re.finditer(r'.{0,60}(admin-ajax|wp_ajax|\$\.ajax|\$\.post|\$\.get|action:\s*["\']).{0,120}', html):
    print(m.group(0).replace("\n", " "))

print("\n--- inline script blocks mentioning turib or bulten (first 2000 chars each, max 5) ---")
count = 0
for m in re.finditer(r'<script(?![^>]*src)[^>]*>(.*?)</script>', html, re.S):
    body = m.group(1)
    if re.search(r'turib|bulten|lidas|ajax', body, re.I) and len(body.strip()) > 20:
        print(body[:2000])
        print("=====")
        count += 1
        if count >= 6:
            break

print("\n--- any table id/class hints ---")
for m in re.finditer(r'<table[^>]{0,200}>', html):
    print(m.group(0))
