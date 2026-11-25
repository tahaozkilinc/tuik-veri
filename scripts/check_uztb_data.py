import json
import urllib.request

BASE = "https://kajilskrmavwqdaipixu.supabase.co"
KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"


def q(path):
    req = urllib.request.Request(BASE + path, headers={"apikey": KEY})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


rows = q(
    "/rest/v1/uztb_fiyat?select=trade_date,urun_adi,min_fiyat,max_fiyat,ort_fiyat,toplam_kilo,islem_adet,ort_rutubet&order=trade_date.desc&limit=20"
)
print("son 20 satir:")
print(json.dumps(rows, ensure_ascii=False, indent=1))

nonnull_rutubet = q(
    "/rest/v1/uztb_fiyat?select=trade_date,ort_rutubet&ort_rutubet=not.is.null&order=trade_date.desc&limit=10"
)
print("\nort_rutubet NULL olmayan son 10 satir:")
print(json.dumps(nonnull_rutubet, ensure_ascii=False, indent=1))

count_all = q("/rest/v1/uztb_fiyat?select=trade_date&order=trade_date.desc&limit=5")
print("\nen son 5 trade_date (herhangi urun):")
print(json.dumps(count_all, ensure_ascii=False, indent=1))
