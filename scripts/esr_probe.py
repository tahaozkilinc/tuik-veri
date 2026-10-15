import json
import urllib.request
import urllib.error

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)", "Accept": "application/json"}
BASE = "https://apps.fas.usda.gov/esrqs/api"

CANDIDATES = [
    "/esr/regions",
    "/esr/commodities",
    "/esr/unitsOfMeasure",
    "/esr/datareleasedates",
]

for path in CANDIDATES:
    url = BASE + path
    print("=" * 60, url)
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read()
            print("status:", resp.status, "content-type:", resp.headers.get("Content-Type"), "len:", len(body))
            print(body[:1500].decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        print("HTTPError:", e.code, e.reason)
        try:
            print(e.read()[:500])
        except Exception:
            pass
    except Exception as e:
        print("ERROR:", type(e).__name__, e)
    print()
