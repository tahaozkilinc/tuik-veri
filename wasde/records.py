"""wasde.parser çıktısını Supabase `wasde_stats` tablosuna yazılacak düz
satır listesine çevirir. Her satır kendi kendini açıklar (measure_label_tr,
unit_label_tr dahil) — dashboard ayrı bir sözlük taşımak zorunda kalmaz.
"""

from __future__ import annotations

import re

from wasde import glossary, parser

MARKETING_YEAR_RE = re.compile(r"^\d{4}/\d{2}")


def _marketing_year(period_label: str) -> str:
    m = MARKETING_YEAR_RE.match(period_label)
    return m.group(0) if m else period_label


# Türkiye'de (TÜİK dahil) bushel/pound/kısa ton kullanılmıyor — WASDE'nin ABD
# tabloları ham haliyle bushel/pound/kısa ton veriyor, biz bunları Dünya
# tablolarıyla aynı birime (Milyon Metrik Ton, $/Ton) çeviriyoruz ki dashboard
# hiçbir yerde bushel göstermesin. Katsayılar resmi USDA dönüşüm ağırlıkları:
# mısır 56 lb/bushel, soya fasulyesi 60 lb/bushel.
KG_PER_BUSHEL = {"corn": 25.40117, "soybeans": 27.2155}
LB_PER_METRIC_TON = 2204.622622
SHORT_TON_PER_METRIC_TON = 1.102311

PRICE_MEASURES = {"avg_farm_price", "avg_price_cents_per_lb", "avg_price_per_short_ton"}


def _us_row_convert(measure_key: str, table: str, value: float) -> tuple[float, str]:
    """(çevrilmiş değer, birim anahtarı) döndürür. Alan (acre) toprak ölçüsü
    olduğu için tona çevrilmiyor, olduğu gibi bırakılıyor."""
    if measure_key in ("area_planted", "area_harvested"):
        return value, "million_acres"

    if table in ("corn", "soybeans"):
        kg_per_bu = KG_PER_BUSHEL[table]
        if measure_key == "yield_per_acre":
            # bushel/acre -> metrik ton/hektar (1 acre = 0.404686 hektar)
            return value * kg_per_bu / 1000 / 0.404686, "metric_tons_per_hectare"
        if measure_key == "avg_farm_price":
            # $/bushel -> $/metrik ton
            return value * (1000 / kg_per_bu), "dollars_per_ton"
        # Milyon Bushel -> Milyon Metrik Ton
        return value * kg_per_bu / 1000, "million_metric_tons"

    if table == "soybean_oil":
        if measure_key == "avg_price_cents_per_lb":
            # sent/pound -> $/metrik ton
            return value / 100 * LB_PER_METRIC_TON, "dollars_per_ton"
        # Milyon Pound -> Milyon Metrik Ton
        return value / LB_PER_METRIC_TON, "million_metric_tons"

    if table == "soybean_meal":
        if measure_key == "avg_price_per_short_ton":
            # $/kısa ton -> $/metrik ton
            return value * SHORT_TON_PER_METRIC_TON, "dollars_per_ton"
        # Bin Kısa Ton -> Milyon Metrik Ton
        return value / SHORT_TON_PER_METRIC_TON / 1000, "million_metric_tons"

    raise ValueError(f"bilinmeyen tablo: {table}")


# ABD ve Dünya tablolarının 4 dönemi her zaman aynı SIRADA üretiliyor: [iki
# yıl önce, önceki pazarlama yılı tahmini, bu pazarlama yılının önceki ay
# projeksiyonu, bu pazarlama yılının bu ay projeksiyonu]. Metindeki gerçek
# etiketler (ay kısaltmaları, yıl numaraları) ay be ay değiştiği için
# compute_ending_stock_trends bu SIRA etiketine (_period_slot) güveniyor,
# metin içeriğine değil — "önceki rapora göre" = proj_prev vs proj_latest,
# "önceki pazarlama yılına göre" = est vs proj_latest.
PERIOD_SLOTS = ["flat", "est", "proj_prev", "proj_latest"]


def _us_rows_to_records(
    rows: dict[str, list[float]],
    commodity: str,
    table: str,
    period_labels: list[str],
    report_date: str,
    release_number: int,
) -> list[dict]:
    records = []
    for raw_label, vals in rows.items():
        measure_key, measure_tr = glossary.us_measure(raw_label)
        for slot, period_label, value in zip(PERIOD_SLOTS, period_labels, vals):
            converted_value, unit_key = _us_row_convert(measure_key, table, value)
            unit_tr = glossary.UNIT_LABELS_TR[unit_key]
            # üç tablonun kendi para birimi ölçüsünü ("$/bushel", "sent/pound",
            # "$/kısa ton") DEĞER çevrildikten SONRA tek bir "avg_price"
            # ($/ton) ölçüsünde birleştiriyoruz — etiket (measure_label_tr)
            # tablo bazlı ayrımı zaten koruyor.
            stored_measure = "avg_price" if measure_key in PRICE_MEASURES else measure_key
            records.append(
                {
                    "report_date": report_date,
                    "release_number": release_number,
                    "commodity": commodity,
                    "scope": "us",
                    "region": None,
                    "period_label": period_label,
                    "marketing_year": _marketing_year(period_label),
                    "measure": stored_measure,
                    "measure_label_tr": measure_tr,
                    "value": round(converted_value, 4),
                    "unit": unit_key,
                    "unit_label_tr": unit_tr,
                    "_period_slot": slot,
                }
            )
    return records


def _world_table_to_records(
    world_data: dict[str, dict[str, list[float]]],
    period_slots: dict[str, str],
    commodity: str,
    columns: list[tuple[str, str]],
    report_date: str,
    release_number: int,
) -> list[dict]:
    records = []
    unit_key = "million_metric_tons"
    unit_tr = glossary.UNIT_LABELS_TR[unit_key]
    label_to_slot = {label: slot for slot, label in period_slots.items()}
    for region_key, series in world_data.items():
        for period_label, vals in series.items():
            for (measure_key, measure_tr), value in zip(columns, vals):
                records.append(
                    {
                        "report_date": report_date,
                        "release_number": release_number,
                        "commodity": commodity,
                        "scope": "world",
                        "region": region_key,
                        "period_label": period_label,
                        "marketing_year": _marketing_year(period_label),
                        "measure": measure_key,
                        "measure_label_tr": measure_tr,
                        "value": value,
                        "unit": unit_key,
                        "unit_label_tr": unit_tr,
                        "_period_slot": label_to_slot.get(period_label),
                    }
                )
    return records


def _pct_change(old: float, new: float) -> float | None:
    if old == 0:
        return None
    return (new - old) / abs(old) * 100.0


def _trend_record(base: dict, measure: str, measure_tr: str, value: float, period_label: str) -> dict:
    return {
        "report_date": base["report_date"],
        "release_number": base["release_number"],
        "commodity": base["commodity"],
        "scope": base["scope"],
        "region": base["region"],
        "period_label": period_label,
        "marketing_year": _marketing_year(period_label),
        "measure": measure,
        "measure_label_tr": measure_tr,
        "value": round(value, 2),
        "unit": "percent",
        "unit_label_tr": "%",
    }


def compute_ending_stock_trends(records: list[dict]) -> list[dict]:
    """Devreden stok (ending_stocks) için iki yüzdelik değişim üretir:
      - ending_stocks_mom_change_pct: bu ayki WASDE'nin kendi önceki ay ->
        bu ay revizyonu — "bir önceki rapora göre" sorusunun cevabı.
      - ending_stocks_yoy_change_pct: önceki pazarlama yılı tahmininden bu
        yılın projeksiyonuna geçiş — stok "düşüş eğiliminde mi" sorusunun
        cevabı.
    Hangi ayların/yılların karşılaştırıldığı metinden değil, her kaydın
    _period_slot etiketinden (flat/est/proj_prev/proj_latest) okunuyor —
    ay kısaltmaları ve pazarlama yılı numaraları her ay değiştiği için
    metne güvenmek kırılgan olurdu. Negatif = düşüş (stok azalıyor).
    """
    by_series: dict[tuple, dict[str, dict]] = {}
    for r in records:
        if r["measure"] != "ending_stocks" or not r.get("_period_slot"):
            continue
        key = (r["commodity"], r["scope"], r["region"])
        by_series.setdefault(key, {})[r["_period_slot"]] = r

    trend_records: list[dict] = []
    for by_slot in by_series.values():
        prev_month = by_slot.get("proj_prev")
        latest = by_slot.get("proj_latest")
        est = by_slot.get("est")
        if latest is None:
            continue
        if prev_month is not None:
            pct = _pct_change(prev_month["value"], latest["value"])
            if pct is not None:
                trend_records.append(
                    _trend_record(
                        latest,
                        "ending_stocks_mom_change_pct",
                        "Devreden Stok - Bir Önceki Rapora Göre Değişim (%)",
                        pct,
                        latest["period_label"],
                    )
                )
        if est is not None:
            pct = _pct_change(est["value"], latest["value"])
            if pct is not None:
                trend_records.append(
                    _trend_record(
                        latest,
                        "ending_stocks_yoy_change_pct",
                        "Devreden Stok - Bir Önceki Pazarlama Yılına Göre Değişim (%)",
                        pct,
                        latest["period_label"],
                    )
                )
    return trend_records


def build_records(text: str, report_date: str, release_number: int) -> list[dict]:
    records: list[dict] = []

    corn_periods, corn_rows = parser.parse_us_corn(text)
    records += _us_rows_to_records(corn_rows, "corn", "corn", corn_periods, report_date, release_number)

    soy_periods, soy = parser.parse_us_soy(text)
    records += _us_rows_to_records(soy["SOYBEANS"], "soybeans", "soybeans", soy_periods, report_date, release_number)
    records += _us_rows_to_records(soy["SOYBEAN OIL"], "soybean_oil", "soybean_oil", soy_periods, report_date, release_number)
    records += _us_rows_to_records(soy["SOYBEAN MEAL"], "soybean_meal", "soybean_meal", soy_periods, report_date, release_number)

    world_corn, world_corn_slots = parser.parse_world_corn(text)
    records += _world_table_to_records(world_corn, world_corn_slots, "corn", glossary.WORLD_CORN_COLUMNS, report_date, release_number)

    world_soy, world_soy_slots = parser.parse_world_soy(text)
    records += _world_table_to_records(world_soy, world_soy_slots, "soybeans", glossary.WORLD_SOYBEAN_COLUMNS, report_date, release_number)

    world_soymeal, world_soymeal_slots = parser.parse_world_soymeal(text)
    records += _world_table_to_records(world_soymeal, world_soymeal_slots, "soybean_meal", glossary.WORLD_SOYBEAN_MEAL_COLUMNS, report_date, release_number)

    records += compute_ending_stock_trends(records)

    # _period_slot sadece bu ay içinde "önceki rapora göre" hesaplaması için
    # ara veri — wasde_stats şemasında böyle bir sütun yok, DB'ye yazılmadan
    # önce atılıyor.
    for r in records:
        r.pop("_period_slot", None)

    return records
