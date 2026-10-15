"""ESR API çıktısını Supabase `export_sales_stats` tablosuna yazılacak düz
satır listesine çevirir. WASDE ile aynı prensip: her satır kendi kendini
açıklar (commodity_name_tr dahil), dashboard ayrı bir sözlük taşımaz.
"""

from __future__ import annotations

from esr import client

# WASDE'de zaten takip ettiğimiz dört emtia + TÜİK'in ayrıca izlediği
# ayçiçek yağı — WASDE'nin dünya bilançosunda karşılığı olmayan tek ürün,
# burada ekleyebiliyoruz çünkü ESR kendi başına bir emtia kodu taşıyor.
TRACKED_COMMODITIES: dict[int, str] = {
    401: "Mısır",
    801: "Soya Fasulyesi",
    901: "Soya Küspesi",
    902: "Soya Yağı",
    1110: "Ayçiçek Yağı",
}


def _current_market_years(release_dates: list[dict]) -> dict[int, int]:
    """Her takip edilen emtia için ESR'nin şu an yayınladığı (en güncel)
    pazarlama yılı numarasını döndürür — sabit kodlamak yerine her
    çalıştırmada API'nin kendi 'datareleasedates' uç noktasından okunuyor,
    böylece pazarlama yılı değiştiğinde (çoğunlukla Eylül/Ekim) elle
    güncelleme gerekmiyor."""
    out: dict[int, int] = {}
    for r in release_dates:
        code = r["commodityCode"]
        if code in TRACKED_COMMODITIES:
            out[code] = r["marketYear"]
    return out


def build_records() -> list[dict]:
    countries = {c["countryCode"]: c["countryDescription"].strip() for c in client.get_countries()}
    market_years = _current_market_years(client.get_release_dates())

    records: list[dict] = []
    for code, tr_name in TRACKED_COMMODITIES.items():
        market_year = market_years.get(code)
        if market_year is None:
            continue
        for row in client.get_exports(code, market_year):
            records.append(
                {
                    "week_ending": row["weekEndingDate"][:10],
                    "commodity_code": code,
                    "commodity_name_tr": tr_name,
                    "marketing_year": market_year,
                    "country_code": row["countryCode"],
                    "country_name": countries.get(row["countryCode"], "Bilinmeyen"),
                    "weekly_exports_ton": row["weeklyExports"],
                    "accumulated_exports_ton": row["accumulatedExports"],
                    "outstanding_sales_ton": row["outstandingSales"],
                    "gross_new_sales_ton": row["grossNewSales"],
                    "current_my_net_sales_ton": row["currentMYNetSales"],
                    "current_my_total_commitment_ton": row["currentMYTotalCommitment"],
                    "next_my_outstanding_sales_ton": row["nextMYOutstandingSales"],
                    "next_my_net_sales_ton": row["nextMYNetSales"],
                }
            )
    return records
