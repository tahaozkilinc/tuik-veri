"""trade_stats tablosundaki distinct ülke kod/isim çiftlerini tam sayfalama ile çeker."""
import json
import urllib.request

SUPABASE_URL = "https://kajilskrmavwqdaipixu.supabase.co"
ANON_KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"


def supa_get_paginated(path):
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}
    page_size = 1000
    rows = []
    frm = 0
    while True:
        req = urllib.request.Request(
            SUPABASE_URL + path,
            headers=dict(headers, Range=f"{frm}-{frm + page_size - 1}"),
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            page = json.loads(resp.read().decode("utf-8"))
        rows.extend(page)
        if len(page) < page_size:
            break
        frm += page_size
    return rows


rows = supa_get_paginated("/rest/v1/trade_stats?select=country_code,country_name&order=country_name.asc")
pairs = sorted({(r["country_code"], r["country_name"]) for r in rows})
print("toplam satır:", len(rows))
print("distinct ülke sayısı:", len(pairs))
for code, name in pairs:
    print(f"{code}\t{name}")
