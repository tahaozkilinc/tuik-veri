"""TÜRİB (Türkiye Ürün İhtisas Borsası) günlük bülten istemcisi.

Kaynak: https://www.turib.com.tr/gunluk-bulten/ — sayfadaki tarih formu
(`getbulletin_date`) sunucuya POST edildiğinde, o güne ait TÜM sekmelerin
(Endeks Verileri / Normal Seans / Anlaşmalı) tabloları zaten sunucu
tarafında render edilmiş olarak tek bir HTML yanıtında dönüyor — ayrı bir
AJAX endpoint'i veya indirilebilir Excel dosyası yok ("Excel'e Aktar"
düğmesi istemci tarafında JS ile aynı tabloyu dışa aktarıyor). Bu yüzden
tek bir POST isteği, görünen tüm veriyi almak için yeterli.
"""

from __future__ import annotations

import datetime as dt
import urllib.parse
import urllib.request

URL = "https://www.turib.com.tr/gunluk-bulten/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)",
    "Content-Type": "application/x-www-form-urlencoded",
}


def fetch_bulletin_html(trade_date: dt.date) -> str:
    body = urllib.parse.urlencode(
        {"getbulletin_date": trade_date.isoformat(), "submit": "Listele"}
    ).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")
