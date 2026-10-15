"""temp: verify anon/publishable key cannot INSERT/UPDATE/DELETE on any public table."""
import json
import urllib.error
import urllib.request

URL = "https://kajilskrmavwqdaipixu.supabase.co"
ANON_KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"

HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
}

TABLES = ["turib_bulletin", "uztb_fiyat", "wasde_stats", "trade_stats", "export_sales_stats"]


def attempt(method, table, body=None, query=""):
    url = f"{URL}/rest/v1/{table}{query}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"{method} {table} -> HTTP {resp.status} (UNEXPECTED: write succeeded!)")
            print(resp.read().decode()[:300])
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode(errors="replace")
        print(f"{method} {table} -> HTTP {e.code} (blocked, as expected)")
        print(body_txt[:300])
    except Exception as e:
        print(f"{method} {table} -> ERROR {e}")
    print()


for t in TABLES:
    attempt("POST", t, body={"trade_date": "1900-01-01", "test": "security-probe-should-fail"})

attempt("PATCH", "turib_bulletin", body={"agirlikli_ortalama_fiyat": 0}, query="?trade_date=eq.1900-01-01")
attempt("DELETE", "turib_bulletin", query="?trade_date=eq.1900-01-01")

# Also confirm READ still works (sanity check RLS isn't over-broad)
req = urllib.request.Request(f"{URL}/rest/v1/turib_bulletin?select=trade_date&limit=1", headers=HEADERS)
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        print("GET turib_bulletin (read sanity check) -> HTTP", resp.status, resp.read().decode()[:200])
except Exception as e:
    print("GET sanity check FAILED:", e)
