"""Geçici keşif scripti — Uzunköprü Ticaret Borsası günlük çekirdek fiyat
sayfasının yapısını inceler (form, tablo, AJAX ipuçları)."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
URL = "https://www.uzunkoprutb.org.tr/sayfa.asp?tur=ssdetay&urun=99992"


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("windows-1254", errors="replace")


html = fetch(URL)
print("total length:", len(html))
print("\n--- first 3000 chars ---")
print(html[:3000])

print("\n--- all <form ...> tags ---")
for m in re.finditer(r'<form[^>]*>', html):
    print(m.group(0))

print("\n--- all <select ...>...</select> blocks (first 800 chars each) ---")
for m in re.finditer(r'<select[^>]*>.{0,900}?</select>', html, re.S):
    print(m.group(0)[:900])
    print("---")

print("\n--- all <input ...> tags ---")
for m in re.finditer(r'<input[^>]*>', html):
    print(m.group(0))

print("\n--- all <table ...> tag attrs ---")
for m in re.finditer(r'<table[^>]{0,200}>', html):
    print(m.group(0))

print("\n--- ajax hints ---")
for m in re.finditer(r'.{0,60}(\.asp\?|XMLHttpRequest|\$\.ajax|\$\.post|\$\.get).{0,120}', html):
    print(m.group(0).replace("\n", " "))
