"""Konya Ticaret Borsası (KTB) günlük bülten istemcisi.

Kaynak: https://www.ktb.org.tr/gunlukfiyat — bir Angular SPA, sayfa HTML'i
veri taşımıyor. Gerçek veri, kimlik doğrulama GEREKTİRMEYEN bir REST API'den
geliyor: GET /api/v1/Alpha.WebPanel/OnlineKullaniciBulten/GetGunlukBulten/{tarih}
(tarih format: YYYY-MM-DD). Bu, "Satış Salonu" bülteni — ayrı bir
GetTescilGunlukBulten (Tescil bülteni) endpoint'i de var ama kullanılmıyor
(kullanıcı özellikle sadece satış salonu bültenini istedi).

Hafta sonu/tatil günlerinde veya henüz yayınlanmamış bugünün bülteninde
boş liste `[]` dönüyor — bu bir hata değil.
"""

from __future__ import annotations

import datetime as dt
import urllib.request

BASE = "https://www.ktb.org.tr"
URL_TMPL = BASE + "/api/v1/Alpha.WebPanel/OnlineKullaniciBulten/GetGunlukBulten/{date}"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)", "Accept": "application/json"}


def fetch_gunluk_bulten(trade_date: dt.date) -> list[dict]:
    import json

    req = urllib.request.Request(URL_TMPL.format(date=trade_date.isoformat()), headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))
