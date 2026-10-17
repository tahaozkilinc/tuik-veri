"""TCMB (Türkiye Cumhuriyet Merkez Bankası) günlük döviz kuru XML istemcisi.

Kaynak: www.tcmb.gov.tr/kurlar/{YYYYMM}/{DDMMYYYY}.xml — tarih parametreli,
kimlik doğrulama gerektirmeyen statik XML. Bugün için ayrıca /kurlar/today.xml
var (gün içinde saat 15:30 TR civarı yayınlanana kadar bir önceki iş gününün
kurunu döndürür). Hafta sonu/resmi tatillerde o tarihe ait dosya yok — kaynak
404 döner, bu normal, backfill/cron bu günleri atlıyor.
"""

from __future__ import annotations

import datetime as dt
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

BASE = "https://www.tcmb.gov.tr/kurlar"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}


def _parse_xml(xml_text: str) -> dict | None:
    root = ET.fromstring(xml_text)
    trade_date = dt.datetime.strptime(root.attrib["Tarih"], "%d.%m.%Y").date()
    for cur in root.findall("Currency"):
        if cur.attrib.get("Kod") == "USD":
            buying = cur.findtext("ForexBuying")
            selling = cur.findtext("ForexSelling")
            return {
                "trade_date": trade_date.isoformat(),
                "forex_buying": float(buying) if buying else None,
                "forex_selling": float(selling) if selling else None,
            }
    return None


def _fetch(url: str) -> str | None:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None  # hafta sonu / resmi tatil — TCMB yayın yapmadı
        raise


def fetch_today() -> dict | None:
    xml_text = _fetch(f"{BASE}/today.xml")
    return _parse_xml(xml_text) if xml_text else None


def fetch_date(trade_date: dt.date) -> dict | None:
    url = f"{BASE}/{trade_date.strftime('%Y%m')}/{trade_date.strftime('%d%m%Y')}.xml"
    xml_text = _fetch(url)
    return _parse_xml(xml_text) if xml_text else None
