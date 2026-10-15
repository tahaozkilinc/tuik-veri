"""TÜRİB günlük bülten HTML'inden "NORMAL SEANS" tablosunu ayrıştırıp
tipik Python kayıtlarına çevirir.

Sütunlar pozisyona göre değil, TÜRİB'in kendi sütun BAŞLIK METNİNE göre
eşleniyor (bkz. HEADER_MAP) — WASDE parser'ında yaşanan "pozisyonel metin
asla hardcode edilmez" dersiyle aynı prensip: sütun sırası değişirse kayıt
bozulmaz, sadece beklenmeyen bir başlık görürsek açıkça hata veririz.
"""

from __future__ import annotations

import datetime as dt
import re

from turib.client import fetch_bulletin_html

# TÜRİB başlık metni -> bizim alan adımız. Değer None olan sütunlar
# (örn. yok) kayda hiç girmez.
HEADER_MAP = {
    "Tarih": "trade_date",
    "ISIN Kodu": "isin_kodu",
    "Enstrüman Sınıfı": "enstruman_sinifi",
    "Önceki Kapanış Fiyatı": "onceki_kapanis",
    "En Düşük Fiyat": "en_dusuk",
    "En Yüksek Fiyat": "en_yuksek",
    "Ağırlıklı Ortalama Fiyat": "agirlikli_ortalama_fiyat",
    "Kapanış Fiyatı": "kapanis_fiyati",
    "İşlem Adedi": "islem_adedi",
    "İşlem Miktarı [KG]": "islem_miktari_kg",
    "İşlem Hacmi [TL]": "islem_hacmi_tl",
    "LİDAŞ Adı": "lidas_adi",
    "İl": "il",
    "İlçe": "ilce",
    "İşlem Kodu": "islem_kodu",
}
NUMERIC_FIELDS = {
    "onceki_kapanis", "en_dusuk", "en_yuksek", "agirlikli_ortalama_fiyat",
    "kapanis_fiyati", "islem_miktari_kg", "islem_hacmi_tl",
}
INT_FIELDS = {"islem_adedi"}
REQUIRED_HEADERS = {"Tarih", "ISIN Kodu", "Enstrüman Sınıfı", "Ağırlıklı Ortalama Fiyat", "LİDAŞ Adı"}


def _strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s).strip()


def _parse_turkish_number(s: str) -> float | None:
    s = s.strip()
    if not s or s == "-":
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _parse_turkish_date(s: str) -> str | None:
    s = s.strip()
    m = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})$", s)
    if not m:
        return None
    day, month, year = m.groups()
    return dt.date(int(year), int(month), int(day)).isoformat()


def _extract_tab_pane(html: str, tab_id: str) -> str | None:
    pattern = (
        r'<div[^>]*class="[^"]*tab-pane[^"]*"[^>]*id="' + re.escape(tab_id) + r'"[^>]*>'
        r'(.*?)(?=<div[^>]*class="[^"]*tab-pane|\Z)'
    )
    m = re.search(pattern, html, re.S)
    return m.group(1) if m else None


def extract_normal_seans_table(html: str) -> tuple[list[str], list[list[str]]]:
    """NORMAL SEANS sekmesinin (id="nav-home") tablosunu (başlıklar, satırlar)
    olarak döndürür. Sekme bulunamazsa ya da tablo yoksa ValueError fırlatır —
    sayfa yapısı değiştiyse sessizce boş/yanlış veri yazmak yerine görünür
    şekilde durmalıyız."""
    pane = _extract_tab_pane(html, "nav-home")
    if pane is None:
        raise ValueError("TÜRİB sayfasında 'nav-home' (NORMAL SEANS) sekmesi bulunamadı — sayfa yapısı değişmiş olabilir.")
    table_m = re.search(r"<table[^>]*>(.*?)</table>", pane, re.S)
    if table_m is None:
        raise ValueError("NORMAL SEANS sekmesinde <table> bulunamadı.")
    table_html = table_m.group(0)

    headers = [_strip_tags(h) for h in re.findall(r"<th[^>]*>(.*?)</th>", table_html, re.S)]
    rows: list[list[str]] = []
    for row_m in re.finditer(r"<tr[^>]*>(.*?)</tr>", table_html, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_m.group(1), re.S)
        if cells:
            rows.append([_strip_tags(c) for c in cells])
    return headers, rows


def parse_records(html: str) -> list[dict]:
    headers, rows = extract_normal_seans_table(html)
    if not rows:
        return []

    missing = REQUIRED_HEADERS - set(headers)
    if missing:
        raise ValueError(f"TÜRİB NORMAL SEANS tablosunda beklenen sütunlar eksik: {sorted(missing)}")

    field_by_col = [HEADER_MAP.get(h) for h in headers]

    records = []
    for row in rows:
        rec: dict = {}
        for field, cell in zip(field_by_col, row):
            if field is None:
                continue
            if field == "trade_date":
                rec[field] = _parse_turkish_date(cell)
            elif field in NUMERIC_FIELDS:
                rec[field] = _parse_turkish_number(cell)
            elif field in INT_FIELDS:
                n = _parse_turkish_number(cell)
                rec[field] = int(n) if n is not None else None
            else:
                rec[field] = cell.strip() or None
        if rec.get("trade_date") and rec.get("isin_kodu"):
            records.append(rec)
    return records


def fetch_day(trade_date: dt.date) -> list[dict]:
    html = fetch_bulletin_html(trade_date)
    return parse_records(html)
