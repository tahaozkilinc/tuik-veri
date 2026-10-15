"""Geçici keşif scripti — TÜRİB günlük bülten sayfasının yapısını,
API/AJAX uçlarını ve indirme linklerini bulmaya çalışır."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}

def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace"), resp.status, dict(resp.headers)

url = "https://www.turib.com.tr/gunluk-bulten/"
html, status, headers = fetch(url)
print("status:", status)
print("length:", len(html))
print("content-type:", headers.get("Content-Type"))

print("\n--- first 3000 chars ---")
print(html[:3000])

print("\n--- script src tags ---")
for m in re.finditer(r'<script[^>]*src="([^"]+)"', html):
    print(m.group(1))

print("\n--- links with 'excel' or 'export' or 'indir' ---")
for m in re.finditer(r'<a[^>]*href="([^"]+)"[^>]*>([^<]*)</a>', html, re.I):
    href, text = m.group(1), m.group(2)
    if re.search(r'excel|export|indir|csv', href + text, re.I):
        print(href, "|", text.strip())

print("\n--- fetch/ajax/api hints in raw html ---")
for m in re.finditer(r'(fetch\(|XMLHttpRequest|axios\.|/api/|\.ashx|\.asmx|wp-json)[^\s"\']{0,80}', html):
    print(m.group(0))
