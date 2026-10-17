"""temp: query distinct TÜRİB enstruman_sinifi values from production to design cascading product filter."""
import json
import urllib.request

URL = "https://kajilskrmavwqdaipixu.supabase.co"
ANON_KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"
HEADERS = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}

rows = []
from_i = 0
page_size = 1000
while True:
    r = urllib.request.Request(
        f"{URL}/rest/v1/turib_bulletin?select=enstruman_sinifi&order=enstruman_sinifi.asc",
        headers=dict(HEADERS, Range=f"{from_i}-{from_i+page_size-1}"),
    )
    with urllib.request.urlopen(r, timeout=30) as resp:
        page = json.loads(resp.read().decode())
    rows.extend(page)
    if len(page) < page_size:
        break
    from_i += page_size

distinct = sorted(set(r["enstruman_sinifi"] for r in rows))
print("total rows:", len(rows))
print("distinct enstruman_sinifi count:", len(distinct))
for d in distinct:
    print(repr(d))
