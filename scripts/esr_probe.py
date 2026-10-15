import re
import urllib.request
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", errors="replace")

url = "https://apps.fas.usda.gov/esrqs/main-WLKZ33AV.js"
js = fetch(url)
print("len:", len(js))

for needle in ["api.fas.usda.gov", "/api/esr", "esrqs/api", "apiUrl", "baseUrl", "X-Api-Key", "proxy"]:
    idxs = [m.start() for m in re.finditer(re.escape(needle), js)]
    print(f"'{needle}': {len(idxs)} hits")
    for i in idxs[:3]:
        print("   ...", js[max(0,i-80):i+120].replace("\n"," "))
