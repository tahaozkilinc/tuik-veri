"""WASDE tablolarındaki ham etiketleri kararlı İngilizce `measure` anahtarına
ve dashboard'da doğrudan gösterilecek Türkçe açıklamaya çevirir.

Her satırın Türkçe karşılığını burada tek yerde tutuyoruz ki DB satırı
kendi kendini açıklasın — dashboard ayrı bir sözlük tutmak zorunda kalmasın.
"""

from __future__ import annotations

import re

FOOTNOTE_RE = re.compile(r"\s*\d+/\s*$")


def normalize_label(raw_label: str) -> str:
    """Sondaki dipnot işaretini ('  2/', ' 4/' gibi) temizler."""
    return FOOTNOTE_RE.sub("", raw_label).strip()


# raw (dipnotsuz) etiket -> (measure key, Türkçe açıklama)
US_MEASURE_MAP: dict[str, tuple[str, str]] = {
    "Area Planted": ("area_planted", "Ekilen Alan"),
    "Area Harvested": ("area_harvested", "Hasat Edilen Alan"),
    "Yield per Harvested Acre": ("yield_per_acre", "Dekar (Acre) Verimi"),
    "Beginning Stocks": ("beginning_stocks", "Devreden Stok (Dönem Başı Stok)"),
    "Production": ("production", "Üretim"),
    "Imports": ("imports", "İthalat"),
    "Supply, Total": ("supply_total", "Toplam Arz"),
    "Feed and Residual": ("feed_and_residual", "Yem ve Diğer Kullanım"),
    "Food,Seed& Industrial": ("food_seed_industrial", "Gıda, Tohumluk ve Sanayi Kullanımı"),
    "Ethanol & by-products": ("ethanol_byproducts", "Etanol ve Yan Ürün Kullanımı"),
    "Domestic, Total": ("domestic_total", "Toplam Yurtiçi Kullanım"),
    "Exports": ("exports", "İhracat"),
    "Use, Total": ("use_total", "Toplam Kullanım"),
    "Ending Stocks": ("ending_stocks", "Dönem Sonu Stok (Devreden Stok)"),
    "Ending stocks": ("ending_stocks", "Dönem Sonu Stok (Devreden Stok)"),
    "Avg.FarmPrice ($/bu)": ("avg_farm_price", "Ortalama Çiftçi Fiyatı"),
    "Crushings": ("crushings", "Kırma (İşleme) Miktarı"),
    "Seed": ("seed", "Tohumluk Kullanımı"),
    "Residual": ("residual", "Diğer/Artık Kullanım"),
    "Domestic Disappearance": ("domestic_disappearance", "Yurtiçi Tüketim"),
    "Biofuel": ("biofuel", "Biyoyakıt Kullanımı"),
    # ham metinde "Food, Feed & other\n   Industrial" iki satıra bölünüyor;
    # ayrıştırıcı sadece ikinci satırı ("Industrial") yakalıyor.
    "Industrial": ("food_feed_other_industrial", "Gıda, Yem ve Diğer Sanayi Kullanımı"),
    "Avg. Price (c/lb)": ("avg_price_cents_per_lb", "Ortalama Fiyat (sent/pound)"),
    "Avg. Price ($/s.t.)": ("avg_price_per_short_ton", "Ortalama Fiyat ($/kısa ton)"),
}

# World tablolarında sütunlar başlığa değil pozisyona göre — her tablo
# türü için sütun sırasını (measure key, Türkçe açıklama) olarak tanımlıyoruz.
WORLD_CORN_COLUMNS = [
    ("beginning_stocks", "Devreden Stok (Dönem Başı)"),
    ("production", "Üretim"),
    ("imports", "İthalat"),
    ("feed", "Yem Kullanımı (Yurtiçi)"),
    ("domestic_total", "Toplam Yurtiçi Kullanım"),
    ("exports", "İhracat"),
    ("ending_stocks", "Dönem Sonu Stok (Devreden Stok)"),
]

WORLD_SOYBEAN_COLUMNS = [
    ("beginning_stocks", "Devreden Stok (Dönem Başı)"),
    ("production", "Üretim"),
    ("imports", "İthalat"),
    ("crush", "Kırma (İşleme) Kullanımı (Yurtiçi)"),
    ("domestic_total", "Toplam Yurtiçi Kullanım"),
    ("exports", "İhracat"),
    ("ending_stocks", "Dönem Sonu Stok (Devreden Stok)"),
]

WORLD_SOYBEAN_MEAL_COLUMNS = [
    ("beginning_stocks", "Devreden Stok (Dönem Başı)"),
    ("production", "Üretim"),
    ("imports", "İthalat"),
    ("domestic_total", "Toplam Yurtiçi Kullanım"),
    ("exports", "İhracat"),
    ("ending_stocks", "Dönem Sonu Stok (Devreden Stok)"),
]

REGION_LABELS_TR: dict[str, str] = {
    "world": "Dünya",
    "world_less_china": "Dünya (Çin Hariç)",
    "united_states": "ABD",
    "total_foreign": "ABD Dışı Toplam",
    "china": "Çin",
}

COMMODITY_LABELS_TR: dict[str, str] = {
    "corn": "Mısır",
    "soybeans": "Soya Fasulyesi",
    "soybean_meal": "Soya Küspesi",
    "soybean_oil": "Soya Yağı",
}

UNIT_LABELS_TR: dict[str, str] = {
    "million_acres": "Milyon Acre",
    "million_metric_tons": "Milyon Metrik Ton",
    "metric_tons_per_hectare": "Ton / Hektar",
    "dollars_per_ton": "$ / Ton",
}


def us_measure(raw_label: str) -> tuple[str, str]:
    """(measure_key, tr_label) — bilinmeyen etiketler için slug fallback,
    hiçbir satırı sessizce atmamak adına."""
    clean = normalize_label(raw_label)
    if clean in US_MEASURE_MAP:
        return US_MEASURE_MAP[clean]
    slug = re.sub(r"[^a-z0-9]+", "_", clean.lower()).strip("_")
    return slug, clean
