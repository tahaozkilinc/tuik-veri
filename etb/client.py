"""Eskişehir Ticaret Borsası (ETB) günlük borsa bülteni istemcisi.

Kaynak: https://www.esktb.org.tr/tr/?PID=bulten/bulten — sunucu tarafında
üretilen düz HTML. Sayfadaki form (id="form1") aynı adrese POST ediliyor:
CAPNO=D (Günlük Borsa Bülteni), BDATE=EDATE=YYYY-MM-DD, SALON='' (tüm tescil
edilen işlemler; '_SALON' sadece salon satışları). Kimlik doğrulama yok,
JavaScript gerekmiyor (GitHub Actions üzerinden canlı doğrulandı,
2026-11-26). Sayfa form gönderiminden önce bir oturum çerezi verdiği için
önce bir GET yapılıyor.

Sandbox'tan esktb.org.tr'ye erişim yok; kaynak sadece GitHub Actions'tan
erişilebilir.
"""

from __future__ import annotations

import datetime as dt
import http.cookiejar
import time
import urllib.parse
import urllib.request

URL = "https://www.esktb.org.tr/tr/?PID=bulten/bulten"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Accept-Language": "tr-TR,tr;q=0.9",
}
RETRY_WAITS = (0, 5, 20, 45)


class EtbSession:
    """Çerezli tek bir oturum. Thread başına ayrı örnek kullanılmalı."""

    def __init__(self) -> None:
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self._primed = False

    def _open(self, data: bytes | None) -> str:
        req = urllib.request.Request(URL, data=data, headers=HEADERS)
        with self._opener.open(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="replace")

    def fetch_day_html(self, trade_date: dt.date) -> str:
        day = trade_date.isoformat()
        form = urllib.parse.urlencode(
            {"SALON": "", "CAPNO": "D", "BDATE": day, "EDATE": day, "LANG": "TR"}
        ).encode()
        last_exc: Exception | None = None
        for wait in RETRY_WAITS:
            if wait:
                time.sleep(wait)
            try:
                if not self._primed:
                    self._open(None)
                    self._primed = True
                return self._open(form)
            except Exception as exc:  # noqa: BLE001 — ağ hatası: tekrar dene
                last_exc = exc
                self._primed = False
        raise RuntimeError(f"ETB {day} çekilemedi: {last_exc}")
