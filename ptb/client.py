"""Polatlı Ticaret Borsası (PTB) günlük bülten istemcisi.

Kaynak: https://bulten.polatliborsa.org.tr/BultenGunluk.ashx?tarih=GG.AA.YYYY
— bir ASP.NET generic handler. Content-Type "text/html" olarak işaretli
ama gövde aslında DÜZ JSON (`{"Bulten": [...]}`) — bu yüzden content-type'a
bakmadan doğrudan json.loads ile ayrıştırıyoruz. Kimlik doğrulama
GEREKMİYOR, Playwright gerekmiyor (canlı doğrulandı — bkz.
scripts/ctb_ptb_probe.py geçmişi).

Her satır hiyerarşik bir ağacın düğümü (Kirilim alanı derinliği
gösteriyor: 0=TARIMSAL kökü, 1=HUBUBAT gibi üst kategori, ... gerçek ürün
satırları en derin seviyede). Kategori/toplam satırlarının MinFiyat/
MaxFiyat/OrtFiyat alanları hep "0" — bu yüzden ayrıştırırken sadece
OrtFiyat'ı "0"dan farklı VE UrunAdi dolu olan satırlar gerçek ürün kabul
ediliyor (bkz. ptb/records.py).

Hafta sonu/tatil günlerinde (işlem olmayan günlerde) API tek, UrunAdi'si
boş bir satır döndürüyor (canlı doğrulandı, 2026-10-18 Pazar) — bu bir
hata değil.
"""

from __future__ import annotations

import datetime as dt
import json
import urllib.request

BASE = "https://bulten.polatliborsa.org.tr/BultenGunluk.ashx"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}


def fetch_gunluk_bulten(trade_date: dt.date) -> list[dict]:
    tarih = trade_date.strftime("%d.%m.%Y")
    url = f"{BASE}?tarih={tarih}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))
    return data.get("Bulten", [])
