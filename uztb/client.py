"""Uzunköprü Ticaret Borsası (UZTB) istemcisi.

/json/gunluk_bulten_detay.asp?mkod=X — sayfa.asp?tur=gunlukbulten sayfasının
kendi JS'inde çağırdığı gerçek API; son ~1 aylık GÜNLÜK ÖZETİ (min/maks/
ağırlıklı ortalama fiyat, toplam kilo, işlem adedi, ortalama yağ oranı)
döner. Tarih parametresine duyarsız (tarih/bas/bit/yil/ay denendi, hepsi
yok sayılıyor) ve kaynağın başka bir arşiv ucu yok — o yüzden bu pencere
her gün yeniden çekilip DB'de biriktiriliyor.
"""

from __future__ import annotations

import json
import urllib.request

BASE_URL = "https://www.uzunkoprutb.org.tr"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}


def fetch_daily_summary(urun_kodu: str) -> list[dict]:
    req = urllib.request.Request(f"{BASE_URL}/json/gunluk_bulten_detay.asp?mkod={urun_kodu}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data.get("json_urungrafik", []) if isinstance(data, dict) else []
