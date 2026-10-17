"""UZTB/KTB tablolarındaki ürün adlarını ve TCMB kur tarih aralığını araştırır."""
import json
import os
import urllib.request

SUPABASE_URL = "https://kajilskrmavwqdaipixu.supabase.co"
ANON_KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"

def supa_get(path):
    req = urllib.request.Request(
        SUPABASE_URL + path,
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))

print("=" * 80)
print("UZTB distinct urun_adi:")
rows = supa_get("/rest/v1/uztb_fiyat?select=urun_adi&order=urun_adi.asc")
print(sorted({r["urun_adi"] for r in rows}))

print("=" * 80)
print("KTB distinct grup_adi + grup_kodu:")
rows = supa_get("/rest/v1/ktb_bulletin?select=grup_kodu,grup_adi&order=grup_adi.asc")
pairs = sorted({(r["grup_kodu"], r["grup_adi"]) for r in rows})
for p in pairs:
    print(p)

print("=" * 80)
print("TCMB min/max tarih kontrolü (yaklaşık 1 yıl geriye):")
import datetime
UA = {"User-Agent": "Mozilla/5.0 (research probe)"}
def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status

for days_ago in [370, 400]:
    d = datetime.date.today() - datetime.timedelta(days=days_ago)
    url = f"https://www.tcmb.gov.tr/kurlar/{d.strftime('%Y%m')}/{d.strftime('%d%m%Y')}.xml"
    try:
        status = fetch(url)
        print(days_ago, "gün önce", d.isoformat(), "->", status)
    except Exception as e:
        print(days_ago, "gün önce", d.isoformat(), "-> ERROR", repr(e))
