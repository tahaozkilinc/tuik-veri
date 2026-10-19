"""Geçici araştırma scripti: KTB GetGunlukBulten API'si yakın geçmiş tarihler
için ne zaman veri döndürmeye başlıyor — "bugün" mü, "dün" mü, yoksa daha
uzun bir yayın gecikmesi mi var? Son 6 takvim gününü tek tek sorgulayıp
her biri için dönen kayıt sayısını yazdırıyor."""
import datetime as dt
import json
import urllib.request

BASE = "https://www.ktb.org.tr"
URL_TMPL = BASE + "/api/v1/Alpha.WebPanel/OnlineKullaniciBulten/GetGunlukBulten/{date}"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)", "Accept": "application/json"}

TR_TZ = dt.timezone(dt.timedelta(hours=3))
today = dt.datetime.now(TR_TZ).date()

for i in range(0, 7):
    day = today - dt.timedelta(days=i)
    req = urllib.request.Request(URL_TMPL.format(date=day.isoformat()), headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        print(f"{day.isoformat()} ({day.strftime('%A')}): {len(data)} kayıt")
    except Exception as exc:
        print(f"{day.isoformat()} ({day.strftime('%A')}): HATA — {exc}")
