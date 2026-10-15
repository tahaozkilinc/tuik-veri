"""temp: KTB - explore GetGunlukBulten param, GrupSinifUrunSelect, and historical date-range endpoint."""
import urllib.request
import urllib.error

BASE = "https://www.ktb.org.tr"


def try_get(path):
    url = BASE + path
    h = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"GET {path} -> {resp.status} (len {len(body)})")
            print(body[:1200])
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"GET {path} -> HTTP {e.code}")
        print(body[:500])
    except Exception as e:
        print(f"GET {path} -> ERROR {e}")
    print()


P = "/api/v1/Alpha.WebPanel/OnlineKullaniciBulten"

# GetBultenGrupSinifUrunSelect(oe) - try group id 1 (Arpa)
try_get(f"{P}/GetBultenGrupSinifUrunSelect/1")
try_get(f"{P}/GetGrupSinifUrunSelectler/1")

# GetGunlukBulten with group id guesses
for gid in [1, 9]:
    try_get(f"{P}/GetGunlukBulten/{gid}")

# GetBultenKartModel(oe,se,ve) - guess (grupId, sinifId, urunId)
try_get(f"{P}/GetBultenKartModel/1/0/0")

# GetBultenGecmisIslemFiyatTarihli(oe,se,ve) - guess (urunId or grupId, date, ?)
try_get(f"{P}/GetBultenGecmisIslemFiyatTarihli/1/2026-10-01/0")
try_get(f"{P}/GetBultenGecmisIslemFiyatTarihli/9/2026-10-01/0")

# GetBultenGecmisIslemFiyatTarihAraligi(oe,se,ve,ze,Ce) - guess (grupId,sinifId,urunId,start,end)
try_get(f"{P}/GetBultenGecmisIslemFiyatTarihAraligi/9/0/0/2026-09-01/2026-10-15")
try_get(f"{P}/GetBultenGecmisIslemFiyatTarihAraligi/9/0/0/01.09.2026/15.10.2026")

# GetBultenGecmisIslemUrunListesi(oe,se,ve,ze)
try_get(f"{P}/GetBultenGecmisIslemUrunListesi/9/0/2026-09-01/2026-10-15")
