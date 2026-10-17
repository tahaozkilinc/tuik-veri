"""wasde_stats tablosundaki distinct measure/unit kombinasyonlarını çeker
(i18n çevirisi için referans — Supabase'e hiçbir şey yazmaz)."""
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


rows = supa_get_paginated("/rest/v1/wasde_stats?select=measure,measure_label_tr,unit,unit_label_tr&order=measure.asc")
print("toplam satır:", len(rows))
pairs = sorted({(r["measure"], r["measure_label_tr"]) for r in rows})
print("=== measure -> measure_label_tr ===")
for p in pairs:
    print(p)
units = sorted({(r["unit"], r["unit_label_tr"]) for r in rows})
print("=== unit -> unit_label_tr ===")
for u in units:
    print(u)
