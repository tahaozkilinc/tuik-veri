"""Geçici keşif scripti #3 — ESRQS web uygulamasının JS bundle'larında
gömülü bir public API key olup olmadığına bakar."""
import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")

base = "https://apps.fas.usda.gov/esrqs/"
html = fetch(base)
scripts = re.findall(r'src="([^"]+\.js)"', html)
print("scripts:", scripts)

for s in scripts:
    url = base + s if not s.startswith("http") else s
    try:
        js = fetch(url)
    except Exception as e:
        print(url, "ERROR", e)
        continue
    hits = re.findall(r'.{0,60}(?:[Xx]-?[Aa]pi-?[Kk]ey|apiKey|api_key).{0,120}', js)
    if hits:
        print("=== ", url, " len=", len(js))
        for h in hits[:10]:
            print("  ", h)
    else:
        print(url, "len=", len(js), "- no apikey hits")
