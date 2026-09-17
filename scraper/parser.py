"""biruni_client.fetch_records() çıktısındaki ham hücreleri (raw_cells)
trade_stats şemasına uyan kayıtlara çevirir.

Sütun sırası (COLUMN_MAP) ilk canlı çalıştırmanın çıktısına bakılarak
kalibre edilecek — şu an en yaygın biruni tablo düzenine göre bir tahmin.
"""

from __future__ import annotations

# raw_cells listesindeki index -> alan adı. İlk canlı çalıştırma sonrası
# gerçek sütun sırasına göre güncellenecek.
COLUMN_MAP = {
    0: "gtip_description",
    1: "country_name",
    2: "value_usd",
    3: "weight_kg",
}


def _to_number(raw: str) -> float | None:
    if not raw:
        return None
    cleaned = raw.strip().replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def normalize(raw_records: list[dict]) -> list[dict]:
    normalized: list[dict] = []

    for rec in raw_records:
        cells = rec.get("raw_cells", [])
        parsed_fields: dict = {}
        for idx, field in COLUMN_MAP.items():
            if idx >= len(cells):
                continue
            value = cells[idx]
            parsed_fields[field] = _to_number(value) if field in ("value_usd", "weight_kg") else value

        normalized.append(
            {
                "period_year": rec["year"],
                "period_month": None,
                "flow": rec["flow"],
                "gtip_code": rec.get("gtip_code"),
                "gtip_description": parsed_fields.get("gtip_description"),
                "port_code": None,
                "port_name": rec.get("port_name"),
                "country_code": None,
                "country_name": parsed_fields.get("country_name"),
                "value_usd": parsed_fields.get("value_usd"),
                "weight_kg": parsed_fields.get("weight_kg"),
                "source": "tuik",
            }
        )

    return normalized
