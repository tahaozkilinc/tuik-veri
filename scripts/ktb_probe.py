"""temp: verify GetGunlukBulten/{date} works for a range of historical dates (1yr back)."""
import urllib.request
import urllib.error

BASE = "https://www.ktb.org.tr"
P = "/api/v1/Alpha.WebPanel/OnlineKullaniciBulten"


def try_get(path, show=900):
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


dates = [
    "2026-10-14",  # yesterday, known good (saw in real app)
    "2026-10-15",  # today
    "2026-09-15",  # 1 month ago
    "2026-01-15",  # 9 months ago
    "2025-10-15",  # 1 year ago exactly
    "2025-10-14",  # 1 year ago, Tuesday-ish
    "2025-06-15",  # 16 months ago
    "2024-10-15",  # 2 years ago
    "2025-10-11",  # weekend (Saturday) - should be empty/no trading
]

for d in dates:
    try_get(f"{P}/GetGunlukBulten/{d}")
