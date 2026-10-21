"""Gaziantep Ticaret Borsası (GTB) günlük salon satış fiyatları istemcisi.

Kaynak: https://www.gtb.org.tr/salon-satis-fiyatlari?tarih=YYYY-MM-DD —
sunucu tarafında render edilen düz HTML sayfası (KTB/TÜRİB'in aksine bir
SPA değil, Playwright gerekmiyor — çalışma zamanında urllib yeterli).

Her ürün satırı şu şekle sahip:
    <tr>
      <td><a href=" .../salon-satis-urun/990100/7 ">ÜRÜN ADI</a></td>
      <td>19,500<i class="fa fa-try"></i></td>   <!-- En Az -->
      <td> 20,000<i class="fa fa-try"></i></td>  <!-- En Çok -->
      <td class="text-center">...İstatistik linki...</td>
    </tr>

Kaynakta ortalama/ağırlıklı ortalama, hacim veya işlem sayısı YOK (sadece
en az/en çok) — bkz. gtb/records.py: ortalama min/max'tan türetiliyor.
Fiyatlar TL/TON cinsinden (TL/kg değil — UZTB/KTB/TÜRİB'den farklı).

Hafta sonu/tatil günlerinde tablo boş (sıfır satır) dönüyor — bu bir hata
değil, sadece atlanıyor.
"""

from __future__ import annotations

import datetime as dt
import re
import urllib.request

BASE = "https://www.gtb.org.tr/salon-satis-fiyatlari"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}

ROW_RE = re.compile(
    r'<tr>\s*<td>\s*<a\s+href="\s*https://www\.gtb\.org\.tr/salon-satis-urun/(?P<kod>\d+)/\d+\s*">'
    r'(?P<ad>[^<]+)</a>\s*</td>\s*'
    r'<td[^>]*>\s*(?P<min>[\d.,]+)\s*<i[^>]*></i>\s*</td>\s*'
    r'<td[^>]*>\s*(?P<max>[\d.,]+)\s*<i[^>]*></i>\s*</td>',
    re.IGNORECASE,
)


def fetch_salon_satis_html(trade_date: dt.date) -> str:
    url = f"{BASE}?tarih={trade_date.isoformat()}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_rows(html: str) -> list[dict]:
    rows = []
    for m in ROW_RE.finditer(html):
        rows.append(
            {
                "urun_kodu": m.group("kod"),
                "urun_adi": m.group("ad").strip(),
                "min_fiyat_raw": m.group("min").strip(),
                "max_fiyat_raw": m.group("max").strip(),
            }
        )
    return rows
