"""temp: try calling KTB API endpoints directly, no auth, see what happens."""
import json
import urllib.request
import urllib.error

BASE = "https://www.ktb.org.tr"


def try_get(path, headers=None):
    url = BASE + path
    h = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            print(f"GET {path} -> {resp.status}")
            print(body[:1500])
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"GET {path} -> HTTP {e.code}")
        print(body[:1500])
    except Exception as e:
        print(f"GET {path} -> ERROR {e}")
    print()


try_get("/api/v1/Alpha.WebPanel/OnlineKullaniciBulten/GetBultenUrunGruplarGruplar")
try_get("/api/v1/Alpha.WebPanel/OnlineKullaniciBulten/GetGunlukBulten/40081")
try_get("/api/v1/Alpha.WebPanel/OnlineKullaniciBulten/GetAnlikBulten/40081")

# with uygulamaId header guess
try_get("/api/v1/Alpha.WebPanel/OnlineKullaniciBulten/GetBultenUrunGruplarGruplar",
        headers={"uygulamaId": "e578abbb-54ff-4690-ade4-9d105f156e96"})
