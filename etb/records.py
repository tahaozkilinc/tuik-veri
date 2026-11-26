"""ETB günlük bülten HTML'ini satır kayıtlarına çevirir.

Tablo yapısı (canlı doğrulandı):
  - başlık satırı: Grup / Sınıf / Ürün Cinsi | En Az Fiyatı | En Çok Fiyatı |
    Ortalama Fiyatı | İşlem Miktarı | İşlem Tutarı | Satış Şekli | İşlem Adedi
  - <td class="mg"> tek hücreli satır: ana grup (BUĞDAYLAR, DİĞER HUBUBATLAR…)
  - <td class="ms"> tek hücreli satır: alt grup (EKM. SERT BUĞDAY…)
  - 8 hücreli satır: ürün (fiyatlar TL/birim, "16,495" = 16,495 TL/kg;
    miktar "61.060,00 KG" — birim sonek olarak geliyor: KG, LT…)
  - ilk hücresi boş satırlar: alt/ana grup ara toplamları (atlanır)
  - "GENEL TOPLAM" satırı: o günün toplam işlem tutarı — ayrıştırmanın
    doğruluğunu kontrol etmek için kullanılır.

Hiç işlem olmayan günlerde (hafta sonu/tatil) başlık var ama ürün satırı
yok: boş liste döner, bu bir hata değildir. Başlık yoksa ya da sayfa başka
bir tarihi gösteriyorsa sayfa yapısı değişmiş demektir: hata fırlatılır.
"""

from __future__ import annotations

import datetime as dt
import html as htmllib
import re

from etb.client import EtbSession

EXPECTED_HEADER = [
    "Grup / Sınıf / Ürün Cinsi", "En Az Fiyatı", "En Çok Fiyatı", "Ortalama Fiyatı",
    "İşlem Miktarı", "İşlem Tutarı", "Satış Şekli", "İşlem Adedi",
]

_TR_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.S | re.I)
_CELL_RE = re.compile(r"<t([hd])\b([^>]*)>(.*?)</t[hd]>", re.S | re.I)


def _text(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmllib.unescape(s).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def _num(s: str) -> float | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def _qty_unit(s: str) -> tuple[float | None, str | None]:
    m = re.match(r"^([\d.,]+)\s*([A-Za-zÇĞİÖŞÜçğıöşü]*)$", (s or "").strip())
    if not m:
        return None, None
    return _num(m.group(1)), (m.group(2).upper() or None)


def parse_day(html: str, trade_date: dt.date) -> list[dict]:
    m = re.search(r'id="BDATE"[^>]*value="([^"]+)"', html, re.S)
    if not m:
        raise ValueError("ETB sayfasında tarih alanı (BDATE) bulunamadı — sayfa yapısı değişmiş olabilir.")
    if m.group(1) != trade_date.isoformat():
        raise ValueError(f"ETB sayfası istenen {trade_date} yerine {m.group(1)} tarihini gösteriyor.")

    header_seen = False
    ana_grup = alt_grup = None
    genel_toplam_tutar = None
    raw: list[dict] = []
    for tr in _TR_RE.finditer(html):
        cells = _CELL_RE.findall(tr.group(1))
        texts = [_text(c[2]) for c in cells]
        if texts[:8] == EXPECTED_HEADER:
            header_seen = True
            continue
        if not header_seen:
            continue
        if len(cells) == 1:
            cls = cells[0][1]
            if re.search(r'class="\s*mg\s*"', cls):
                ana_grup, alt_grup = texts[0], None
            elif re.search(r'class="\s*ms\s*"', cls):
                alt_grup = texts[0]
            continue
        if texts and texts[0] == "GENEL TOPLAM":
            genel_toplam_tutar = _num(texts[2]) if len(texts) > 2 else None
            continue
        if len(texts) != 8 or not texts[0]:
            continue  # ara toplam satırları (ilk hücre boş)
        qty, unit = _qty_unit(texts[4])
        rec = {
            "trade_date": trade_date.isoformat(),
            "ana_grup": ana_grup,
            "alt_grup": alt_grup,
            "urun_adi": texts[0],
            "min_fiyat": _num(texts[1]),
            "max_fiyat": _num(texts[2]),
            "ort_fiyat": _num(texts[3]),
            "toplam_kilo": qty,
            "birim": unit,
            "islem_tutari_tl": _num(texts[5]),
            "satis_sekli": texts[6] or None,
            "islem_adet": int(_num(texts[7]) or 0),
        }
        if rec["ort_fiyat"] is None or rec["toplam_kilo"] is None:
            raise ValueError(f"ETB {trade_date}: ürün satırı ayrıştırılamadı: {texts}")
        raw.append(rec)

    if not header_seen:
        raise ValueError("ETB bülten tablosunun başlığı bulunamadı — sayfa yapısı değişmiş olabilir.")
    if not raw:
        return []

    # Kendi kendini doğrulama: ürün satırlarının tutar toplamı kaynağın
    # GENEL TOPLAM'ına eşit olmalı (yuvarlama payı 1 TL/satır).
    if genel_toplam_tutar is not None:
        s = sum(r["islem_tutari_tl"] or 0 for r in raw)
        if abs(s - genel_toplam_tutar) > max(1.0, len(raw) * 0.05):
            raise ValueError(f"ETB {trade_date}: satır tutar toplamı {s:.2f} ≠ GENEL TOPLAM {genel_toplam_tutar:.2f}")

    return _merge_duplicates(raw)


def _merge_duplicates(rows: list[dict]) -> list[dict]:
    """Aynı gün aynı (grup, alt grup, ürün, satış şekli) iki kez geçerse tek
    satırda birleştirir (miktar/tutar/adet toplanır, ortalama = tutar/miktar)
    — tablodaki unique kısıtıyla çakışmaması için."""
    out: dict[tuple, dict] = {}
    for r in rows:
        key = (r["ana_grup"], r["alt_grup"], r["urun_adi"], r["satis_sekli"])
        if key not in out:
            out[key] = dict(r)
            continue
        e = out[key]
        e["min_fiyat"] = min(x for x in (e["min_fiyat"], r["min_fiyat"]) if x is not None)
        e["max_fiyat"] = max(x for x in (e["max_fiyat"], r["max_fiyat"]) if x is not None)
        e["toplam_kilo"] = (e["toplam_kilo"] or 0) + (r["toplam_kilo"] or 0)
        e["islem_tutari_tl"] = (e["islem_tutari_tl"] or 0) + (r["islem_tutari_tl"] or 0)
        e["islem_adet"] = (e["islem_adet"] or 0) + (r["islem_adet"] or 0)
        if e["toplam_kilo"]:
            e["ort_fiyat"] = round(e["islem_tutari_tl"] / e["toplam_kilo"], 4)
    return list(out.values())


def fetch_day(trade_date: dt.date, session: EtbSession | None = None) -> list[dict]:
    session = session or EtbSession()
    return parse_day(session.fetch_day_html(trade_date), trade_date)
