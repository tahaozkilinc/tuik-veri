import re
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", errors="replace")

js = fetch("https://apps.fas.usda.gov/esrqs/main-WLKZ33AV.js")
print("len:", len(js))

# apiEndpoint ile birlikte kullanılan string concatenation'ları bul
for m in re.finditer(r'apiEndpoint\s*[,+]\s*"([^"]{1,60})"', js):
    print("apiEndpoint + ->", m.group(1))

# Genel olarak ESR'ye özgü kelimeleri (regions/commodities/countries/exports) içeren kısa yol parçalarını ara
for kw in ["egions", "ommodit", "ountries", "nitsOfMeasure", "ataRelease", "/exports/"]:
    hits = [m.start() for m in re.finditer(kw, js)]
    print(f"'{kw}': {len(hits)} hits")
    for i in hits[:5]:
        print("   ...", js[max(0,i-60):i+60].replace("\n", " "))
