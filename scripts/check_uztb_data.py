import json
import urllib.request

BASE = "https://kajilskrmavwqdaipixu.supabase.co"
KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"


def q(path):
    req = urllib.request.Request(BASE + path, headers={"apikey": KEY})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


rows = q(
    "/rest/v1/uztb_fiyat?select=trade_date,ort_fiyat,toplam_kilo,islem_adet,ort_rutubet&order=trade_date.desc&limit=25"
)
print("son 25 satir (en yeniden eskiye):")
for r in rows:
    print(r)
