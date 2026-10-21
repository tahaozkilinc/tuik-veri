"""Çorum Ticaret Borsası (ÇTB) günlük ürün fiyat özeti istemcisi.

Kaynak: https://www.corumtb.org.tr/Bulten/Aralik?baslangic=YYYY-MM-DD&bitis=YYYY-MM-DD
— kimlik doğrulama GEREKTİRMEYEN bir JSON API. Sayfanın kendi "tarih
aralığı" filtresi bu endpoint'e GET isteği atıyor (Playwright ile
doğrulandı — bkz. scripts/ctb_ptb_probe.py geçmişi); verilen aralıktaki
TÜM işlemlerden ürün bazında min/ortalama/max fiyat + toplam miktar +
işlem sayısı hesaplayıp döndürüyor. baslangic=bitis=aynı gün verilince o
GÜNÜN özeti elde ediliyor (günlük veri için kullanım şekli budur).

Yanıt şekli:
    {"basarili": true, "data": {"urunler": [
        {"urunAdi": "...", "enAzFiyat": 9.5, "ortalamaFiyat": 12.53...,
         "enCokFiyat": 15.26, "islemAdedi": 1181, "toplamTonaj": 6971000.0,
         "toplamFiyat": 87608190.0, "ortalamaKgFiyat": 12.5675...},
        ...
    ]}}

Hafta sonu/tatil günlerinde (işlem olmayan günlerde) API `basarili: false`
ile boş sonuç döndürüyor (canlı doğrulandı — bkz. scripts/ctb_ptb_probe.py
geçmişi, 2026-10-18 Pazar) — bu bir hata değil, sadece o gün atlanıyor.
"""

from __future__ import annotations

import datetime as dt
import json
import urllib.request

BASE = "https://www.corumtb.org.tr/Bulten/Aralik"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)", "Accept": "application/json"}


def fetch_aralik(start: dt.date, end: dt.date) -> list[dict]:
    url = f"{BASE}?baslangic={start.isoformat()}&bitis={end.isoformat()}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))
    if not data.get("basarili"):
        return []
    return data.get("data", {}).get("urunler", [])
