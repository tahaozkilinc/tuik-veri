import urllib.request
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}
for url in ["https://api.fas.usda.gov", "https://api.fas.usda.gov/", "https://apps.fas.usda.gov/opendatawebV2/"]:
    print("=" * 60, url)
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print("status:", resp.status, "final url:", resp.geturl())
            print(body[:2000])
    except Exception as e:
        print("ERROR:", type(e).__name__, e)
