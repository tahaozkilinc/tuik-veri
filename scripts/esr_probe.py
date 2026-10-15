"""Geçici keşif scripti — USDA FAS Export Sales Reporting sisteminin gerçek
veri formatını/endpoint'lerini bulmaya çalışır. Sil-ve-kullan."""
import urllib.request
import urllib.error

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}

CANDIDATES = [
    "https://apps.fas.usda.gov/export-sales/weeksumm.htm",
    "https://apps.fas.usda.gov/export-sales",
    "https://apps.fas.usda.gov/esrqs/",
    "https://apps.fas.usda.gov/esrqs/ESRHome.aspx",
    "https://apps.fas.usda.gov/opendataweb/api/esr/exports",
    "https://api.fas.usda.gov/api/esr/exports",
    "https://apps.fas.usda.gov/opendatawebV2/assets/swagger/swagger.json",
]

for url in CANDIDATES:
    print("=" * 70)
    print("URL:", url)
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            print("status:", resp.status, "content-type:", ctype, "len:", len(body))
            text = body.decode("utf-8", errors="replace")
            print(text[:1500])
    except urllib.error.HTTPError as e:
        print("HTTPError:", e.code, e.reason)
        try:
            print(e.read()[:500])
        except Exception:
            pass
    except Exception as e:
        print("ERROR:", type(e).__name__, e)
    print()
