import urllib.request
import urllib.error

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)", "X-Api-Key": "DEMO_KEY"}

for url in [
    "https://api.fas.usda.gov/api/esr/commodities",
    "https://api.fas.usda.gov/api/esr/regions",
]:
    print("=" * 60, url)
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read()
            print("status:", resp.status, "len:", len(body))
            print(body[:1200].decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        print("HTTPError:", e.code, e.reason)
        print(e.read()[:500])
    except Exception as e:
        print("ERROR:", type(e).__name__, e)
