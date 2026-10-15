"""Geçici kontrol scripti — turib_bulletin tablosunun gerçek max(trade_date)
ve toplam satır sayısını, canlı Supabase'den (anon key, salt-okunur REST)
doğrudan sorgular."""
import json
import urllib.request

SUPABASE_URL = "https://kajilskrmavwqdaipixu.supabase.co"
ANON_KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"
HEADERS = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}


def get(path):
    req = urllib.request.Request(SUPABASE_URL + path, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


print("--- max trade_date (order desc, limit 5) ---")
rows = get("/rest/v1/turib_bulletin?select=trade_date&order=trade_date.desc&limit=5")
print(rows)

print("\n--- min trade_date (order asc, limit 5) ---")
rows2 = get("/rest/v1/turib_bulletin?select=trade_date&order=trade_date.asc&limit=5")
print(rows2)

print("\n--- total row count (Prefer: count=exact via headers) ---")
req = urllib.request.Request(
    SUPABASE_URL + "/rest/v1/turib_bulletin?select=trade_date&limit=1",
    headers={**HEADERS, "Prefer": "count=exact", "Range": "0-0"},
)
with urllib.request.urlopen(req, timeout=30) as resp:
    print("Content-Range header:", resp.headers.get("Content-Range"))

print("\n--- distinct trade_date count for MISIR 1.SINIF specifically ---")
rows3 = get("/rest/v1/turib_bulletin?select=trade_date&enstruman_sinifi=eq.MISIR%201.SINIF&order=trade_date.desc&limit=5")
print(rows3)
