"""Edirne Ticaret Borsası (EDTB) online bülten istemcisi.

Kaynak: https://online.etb.org.tr/online-bulten?grupKodu=AYC&sinifKodu=-&tarih=-
— bir Angular uygulaması; sayfa açılınca kendi arka ucundan YAĞLIK
AYÇİÇEKLER grubunun (tüm sınıflar) günlük özet geçmişini
(GetBultenIslemUrunListesi/AYC/-/-) JSON olarak çekip tabloya basıyor.

Burada sayfayı normal bir ziyaretçi gibi başsız (headless) Chromium'la
açıyoruz ve sayfanın KENDİ yüklediği bu yanıtı okuyoruz — ayrıca bir API
çağrısı, oturum/anahtar taklidi yok. Tek bir sayfa açılışı tüm günlük
geçmişi (1 yıldan fazla) getiriyor.
"""

from __future__ import annotations

import json
import time

PAGE_URL = "https://online.etb.org.tr/online-bulten?grupKodu=AYC&sinifKodu=-&tarih=-"
LIST_PATH = "/OnlineKullaniciBulten/GetBultenIslemUrunListesi/AYC/-/-"
RETRY_WAITS = (0, 20, 60)


class EdtbFetchError(RuntimeError):
    """Kaynağa ulaşılamadı / sayfa yanıt vermedi (geçici kabul edilir)."""


def _fetch_once() -> list[dict]:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            with page.expect_response(lambda r: LIST_PATH in r.url and r.request.method == "GET", timeout=90_000) as info:
                page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=90_000)
            resp = info.value
            if resp.status != 200:
                raise EdtbFetchError(f"bülten listesi HTTP {resp.status}")
            data = json.loads(resp.text())
        finally:
            browser.close()
    rows = data.get("UrunListesi")
    if not isinstance(rows, list):
        raise ValueError("EDTB yanıtında 'UrunListesi' yok — kaynak yapısı değişmiş olabilir.")
    return rows


def fetch_daily_list() -> list[dict]:
    last: Exception | None = None
    for wait in RETRY_WAITS:
        if wait:
            time.sleep(wait)
        try:
            return _fetch_once()
        except ValueError:
            raise
        except Exception as exc:  # noqa: BLE001 — ağ/tarayıcı hatası: tekrar dene
            last = exc
    raise EdtbFetchError(f"EDTB bülteni çekilemedi: {last}")
