"""TÜRİB günlük bülten özeti — Mısır 1. ve 2. Sınıf için kurumsal PDF rapor
üretir (SUNAR logolu). O günkü en yüksek/en düşük fiyat, hacim-ağırlıklı
ortalama fiyat ve bir önceki İŞLEM gününe (takvim günü değil — hafta
sonu/tatil atlanmış olabilir) göre yüzde değişimi gösterir.
"""

from __future__ import annotations

import datetime as dt
import os

from fpdf import FPDF

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "sunar-logo.png")
FONT_REGULAR = os.path.join(ASSETS_DIR, "DejaVuSans.ttf")
FONT_BOLD = os.path.join(ASSETS_DIR, "DejaVuSans-Bold.ttf")

TRACKED_PRODUCTS = ["MISIR 1.SINIF", "MISIR 2.SINIF"]
BRAND_GREEN = (31, 92, 54)
MUTED = (120, 120, 120)
INK = (25, 25, 25)

REPORT_COLUMNS = "trade_date,agirlikli_ortalama_fiyat,en_yuksek,en_dusuk,islem_miktari_kg"


def _fetch_rows(client, trade_date_iso: str, product: str) -> list[dict]:
    resp = (
        client.table("turib_bulletin")
        .select(REPORT_COLUMNS)
        .eq("trade_date", trade_date_iso)
        .eq("enstruman_sinifi", product)
        .execute()
    )
    return resp.data


def _previous_trading_day_rows(client, before_date_iso: str, product: str) -> tuple[str | None, list[dict]]:
    resp = (
        client.table("turib_bulletin")
        .select("trade_date")
        .eq("enstruman_sinifi", product)
        .lt("trade_date", before_date_iso)
        .order("trade_date", desc=True)
        .limit(1)
        .execute()
    )
    if not resp.data:
        return None, []
    prev_date = resp.data[0]["trade_date"]
    return prev_date, _fetch_rows(client, prev_date, product)


def fetch_report_data(client, trade_date: dt.date) -> dict:
    """{product: {"rows": [...], "prev_date": str|None, "prev_rows": [...]}}"""
    trade_date_iso = trade_date.isoformat()
    data = {}
    for product in TRACKED_PRODUCTS:
        rows = _fetch_rows(client, trade_date_iso, product)
        prev_date, prev_rows = _previous_trading_day_rows(client, trade_date_iso, product)
        data[product] = {"rows": rows, "prev_date": prev_date, "prev_rows": prev_rows}
    return data


def _weighted_avg(rows: list[dict]) -> float | None:
    sum_price_kg = sum((r["agirlikli_ortalama_fiyat"] or 0) * (r["islem_miktari_kg"] or 0) for r in rows)
    sum_kg = sum((r["islem_miktari_kg"] or 0) for r in rows)
    return sum_price_kg / sum_kg if sum_kg else None


def _day_high_low(rows: list[dict]) -> tuple[float | None, float | None]:
    highs = [r["en_yuksek"] for r in rows if r.get("en_yuksek") and r["en_yuksek"] > 0]
    lows = [r["en_dusuk"] for r in rows if r.get("en_dusuk") and r["en_dusuk"] > 0]
    return (max(highs) if highs else None, min(lows) if lows else None)


def _fmt_price(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " TL/kg"


def _fmt_change(v: float | None) -> str:
    if v is None:
        return "— (önceki işlem günü verisi yok)"
    arrow = "▲" if v >= 0 else "▼"
    return f"{arrow} %{abs(v):.2f}".replace(".", ",")


def render_report_pdf(trade_date: dt.date, data: dict) -> bytes:
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_font("DejaVu", "", FONT_REGULAR)
    pdf.add_font("DejaVu", "B", FONT_BOLD)
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    if os.path.exists(LOGO_PATH):
        pdf.image(LOGO_PATH, x=15, y=14, w=40)

    pdf.set_xy(0, 15)
    pdf.set_font("DejaVu", "B", 16)
    pdf.set_text_color(*BRAND_GREEN)
    pdf.cell(195, 8, "TÜRİB Günlük Bülten Özeti", align="R")
    pdf.set_xy(0, 24)
    pdf.set_font("DejaVu", "", 11)
    pdf.set_text_color(*MUTED)
    pdf.cell(195, 6, trade_date.strftime("%d.%m.%Y") + " — Normal Seans", align="R")

    pdf.set_y(44)
    pdf.set_draw_color(225, 225, 225)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())
    pdf.ln(10)

    row_h = 8.5
    col_label_w = 95
    col_value_w = 85

    for product in TRACKED_PRODUCTS:
        entry = data.get(product, {"rows": [], "prev_rows": []})
        rows = entry["rows"]

        pdf.set_x(15)
        pdf.set_font("DejaVu", "B", 13)
        pdf.set_text_color(*BRAND_GREEN)
        pdf.cell(col_label_w + col_value_w, 8, product, new_x="LMARGIN", new_y="NEXT")

        if not rows:
            pdf.set_x(15)
            pdf.set_font("DejaVu", "", 10.5)
            pdf.set_text_color(*MUTED)
            pdf.cell(col_label_w + col_value_w, 7, "Bugün bu üründe işlem gerçekleşmedi.", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(5)
            continue

        high, low = _day_high_low(rows)
        wavg = _weighted_avg(rows)
        prev_wavg = _weighted_avg(entry["prev_rows"]) if entry["prev_rows"] else None
        change_pct = ((wavg - prev_wavg) / prev_wavg * 100) if (wavg is not None and prev_wavg) else None

        pairs = [
            ("En Yüksek Fiyat", _fmt_price(high)),
            ("En Düşük Fiyat", _fmt_price(low)),
            ("Ağırlıklı Ortalama Fiyat", _fmt_price(wavg)),
            ("Bir Önceki İşlem Gününe Göre Değişim", _fmt_change(change_pct)),
        ]
        for label, value in pairs:
            pdf.set_x(15)
            pdf.set_font("DejaVu", "", 10.5)
            pdf.set_text_color(*MUTED)
            pdf.cell(col_label_w, row_h, label, border="B")
            pdf.set_font("DejaVu", "B", 10.5)
            pdf.set_text_color(*INK)
            pdf.cell(col_value_w, row_h, value, border="B", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(7)

    pdf.set_auto_page_break(auto=False)
    pdf.set_y(-22)
    pdf.set_font("DejaVu", "", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 5, "Kaynak: TÜRİB (Türkiye Ürün İhtisas Borsası) günlük bülteni, Normal Seans.", align="C", new_x="LMARGIN", new_y="NEXT")
    now_tr = dt.datetime.now(dt.timezone(dt.timedelta(hours=3)))
    pdf.cell(0, 5, f"Oluşturulma: {now_tr.strftime('%d.%m.%Y %H:%M')} (TR saati)", align="C")

    return bytes(pdf.output())
