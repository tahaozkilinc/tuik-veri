"""Uzunköprü Ticaret Borsası (UZTB) istemcisi.

İki uç nokta kullanılıyor (ikisi de sayfa.asp?tur=ssdetay&urun=X sayfasının
kendi JS'inde çağırdığı gerçek API'ler — sayfanın HTML'i veriyi barındırmıyor):

- /api/salon-satis.php?mkod=X — SADECE BUGÜNÜN bireysel Salon Satışı
  işlemlerini (köy, miktar, rutubet, fiyat vb.) JSON olarak döner; bir
  tarih parametresi kabul etmiyor, her zaman en güncel günü verir.
- /json/gunluk_bulten_detay.asp?mkod=X — son ~1 aylık GÜNLÜK ÖZET (min/
  maks/ağırlıklı ortalama fiyat, toplam kilo, işlem adedi) döner; bu da
  tarih parametresine duyarsız — kaynağın kendisi sadece son birkaç
  haftayı tutuyor, daha eskisi için herhangi bir API/arşiv bulunamadı.
"""

from __future__ import annotations

import json
import urllib.request

BASE_URL = "https://www.uzunkoprutb.org.tr"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}


def _get_json(path: str):
    req = urllib.request.Request(BASE_URL + path, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_today_rows(urun_kodu: str) -> list[dict]:
    """Bugünün bireysel Salon Satışı işlemleri."""
    data = _get_json(f"/api/salon-satis.php?mkod={urun_kodu}")
    return data if isinstance(data, list) else []


def fetch_daily_summary(urun_kodu: str) -> list[dict]:
    """Kaynağın elinde tuttuğu son ~1 aylık günlük özet (json_urungrafik)."""
    data = _get_json(f"/json/gunluk_bulten_detay.asp?mkod={urun_kodu}")
    return data.get("json_urungrafik", []) if isinstance(data, dict) else []
