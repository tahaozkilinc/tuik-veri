"""temp: KTB - try singular GetBultenGrupSinifUrunSelect with real ids, and self-referencing triples."""
import urllib.request
import urllib.error

BASE = "https://www.ktb.org.tr"
P = "/api/v1/Alpha.WebPanel/OnlineKullaniciBulten"


def try_get(path, show=600):
    url = BASE + path
    h = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"GET {path} -> {resp.status} (len {len(body)})")
            print(body[:show])
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"GET {path} -> HTTP {e.code}")
        print(body[:400])
    except Exception as e:
        print(f"GET {path} -> ERROR {e}")
    print()


# singular endpoint, real group ids
for gid in [937, 1281, 1, 10]:
    try_get(f"{P}/GetBultenGrupSinifUrunSelect/{gid}")

# KartModel self-referencing (grupId as all three)
for gid in [937, 1281, 1]:
    try_get(f"{P}/GetBultenKartModel/{gid}/{gid}/{gid}")

# GetBultenFiyatTarihli(oe,se,ve,ze) - 4 params, maybe (grup,sinif,urun,tarih)
try_get(f"{P}/GetBultenFiyatTarihli/937/937/937/2026-10-15")
try_get(f"{P}/GetBultenFiyatTarihli/1281/1281/1281/2026-10-15")

# GetBultenGecmisIslemFiyatTarihli(oe,se,ve) maybe (grup,sinif,tarih) not (grup,tarih,urun)
try_get(f"{P}/GetBultenGecmisIslemFiyatTarihli/937/937/2026-10-15")

# try GetStokListesi which takes single id
try_get(f"{P}/GetStokListesi/937")
