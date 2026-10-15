"""temp: KTB - get full real group id list, then try historical endpoints with real ids + ISO dates."""
import json
import urllib.request
import urllib.error

BASE = "https://www.ktb.org.tr"
P = "/api/v1/Alpha.WebPanel/OnlineKullaniciBulten"


def try_get(path, show=1500):
    url = BASE + path
    h = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"GET {path} -> {resp.status} (len {len(body)})")
            print(body[:show])
            return body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"GET {path} -> HTTP {e.code}")
        print(body[:500])
    except Exception as e:
        print(f"GET {path} -> ERROR {e}")
    print()
    return None


body = try_get(f"{P}/GetGrupSinifUrunSelectler/1", show=100000)
print("\n==== parsed real group ids ====")
try:
    data = json.loads(body)
    for g in data.get("Gruplar", []):
        print(g["Id"], g["GrupKodu"], g["GrupAdi"])
except Exception as e:
    print("parse error", e)

print("\n==== try real id 937 (Kirmizi Sert Bugday, had 23 trades today) ====")
try_get(f"{P}/GetBultenKartModel/937/0/0")
try_get(f"{P}/GetBultenGecmisIslemFiyatTarihli/937/2026-10-15/0")
try_get(f"{P}/GetBultenGecmisIslemFiyatTarihAraligi/937/0/0/2026-09-01/2026-10-15")
try_get(f"{P}/GetBultenGecmisIslemUrunListesi/937/0/2026-09-01/2026-10-15")

print("\n==== try group id 1 (Arpa, had 31 trades today) ====")
try_get(f"{P}/GetBultenKartModel/1/0/0")
try_get(f"{P}/GetBultenGecmisIslemFiyatTarihAraligi/1/0/0/2026-09-01/2026-10-15")
