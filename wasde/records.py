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


def _us_row_unit(measure_key: str, table: str) -> str:
    if table == "corn" or table == "soybeans":
        if measure_key in ("area_planted", "area_harvested"):
            return "million_acres"
        if measure_key == "yield_per_acre":
            return "bushels_per_acre"
        if measure_key == "avg_farm_price":
            return "dollars_per_bushel"
        return "million_bushels"
    if table == "soybean_oil":
        if measure_key == "avg_price_cents_per_lb":
            return "cents_per_pound"
        return "million_pounds"
    if table == "soybean_meal":
        if measure_key == "avg_price_per_short_ton":
            return "dollars_per_short_ton"
        return "thousand_short_tons"
    raise ValueError(f"bilinmeyen tablo: {table}")


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
        unit_key = _us_row_unit(measure_key, table)
        unit_tr = glossary.UNIT_LABELS_TR[unit_key]
        for period_label, value in zip(period_labels, vals):
            records.append(
                {
                    "report_date": report_date,
                    "release_number": release_number,
                    "commodity": commodity,
                    "scope": "us",
                    "region": None,
                    "period_label": period_label,
                    "marketing_year": _marketing_year(period_label),
                    "measure": measure_key,
                    "measure_label_tr": measure_tr,
                    "value": value,
                    "unit": unit_key,
                    "unit_label_tr": unit_tr,
                }
            )
    return records


US_PERIOD_LABELS = ["2024/25", "2025/26 Est.", "2026/27 Proj. Aug", "2026/27 Proj. Sep"]


def _world_table_to_records(
    world_data: dict[str, dict[str, list[float]]],
    commodity: str,
    columns: list[tuple[str, str]],
    report_date: str,
    release_number: int,
) -> list[dict]:
    records = []
    unit_key = "million_metric_tons"
    unit_tr = glossary.UNIT_LABELS_TR[unit_key]
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
                    }
                )
    return records


def build_records(text: str, report_date: str, release_number: int) -> list[dict]:
    records: list[dict] = []

    corn_rows = parser.parse_us_corn(text)
    records += _us_rows_to_records(corn_rows, "corn", "corn", US_PERIOD_LABELS, report_date, release_number)

    soy = parser.parse_us_soy(text)
    records += _us_rows_to_records(soy["SOYBEANS"], "soybeans", "soybeans", US_PERIOD_LABELS, report_date, release_number)
    records += _us_rows_to_records(soy["SOYBEAN OIL"], "soybean_oil", "soybean_oil", US_PERIOD_LABELS, report_date, release_number)
    records += _us_rows_to_records(soy["SOYBEAN MEAL"], "soybean_meal", "soybean_meal", US_PERIOD_LABELS, report_date, release_number)

    world_corn = parser.parse_world_corn(text)
    records += _world_table_to_records(world_corn, "corn", glossary.WORLD_CORN_COLUMNS, report_date, release_number)

    world_soy = parser.parse_world_soy(text)
    records += _world_table_to_records(world_soy, "soybeans", glossary.WORLD_SOYBEAN_COLUMNS, report_date, release_number)

    world_soymeal = parser.parse_world_soymeal(text)
    records += _world_table_to_records(world_soymeal, "soybean_meal", glossary.WORLD_SOYBEAN_MEAL_COLUMNS, report_date, release_number)

    return records
