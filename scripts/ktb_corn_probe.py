"""KTB tablosunda Mısır var mı — tam sayfalama ile kontrol eder (önceki probe
Range header kullanmadığı için PostgREST'in varsayılan limit'ine takılmış olabilir)."""
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
        with urllib.request.urlopen(req, timeout=20) as resp:
            page = json.loads(resp.read().decode("utf-8"))
        rows.extend(page)
        if len(page) < page_size:
            break
        frm += page_size
    return rows


rows = supa_get_paginated("/rest/v1/ktb_bulletin?select=trade_date,grup_kodu,grup_adi,sinif_adi&order=trade_date.asc")
print("toplam KTB satır sayısı:", len(rows))
pairs = sorted({(r["grup_kodu"], r["grup_adi"]) for r in rows})
print("distinct (grup_kodu, grup_adi):")
for p in pairs:
    print(" ", p)

misir_rows = [r for r in rows if "MISIR" in (r["grup_adi"] or "").upper() or "MISIR" in (r["sinif_adi"] or "").upper()]
print("Mısır içeren satır sayısı:", len(misir_rows))
if misir_rows:
    dates = sorted({r["trade_date"] for r in misir_rows})
    print("ilk tarih:", dates[0], "son tarih:", dates[-1], "toplam gün:", len(dates))
    print("örnek 5 satır:", misir_rows[:5])
