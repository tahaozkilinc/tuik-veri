"""Keşif/doğrulama: kullanıcının istediği 6 yeni GTİP kodu (ayçiçek/soya/mısır
ham-rafine yağ) için TÜİK Qlik Engine'den veri çekip özet basar — Supabase'e
hiçbir şey yazmaz. Amaç: (1) TÜİK sisteminin bu kodları gerçekten tanıdığını
ve resmi açıklamasını doğrulamak, (2) veri hacmini/aralığını görmek.
"""

from __future__ import annotations

import collections
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scraper.qlik_client import QlikClientError, fetch_trade_stats

CANDIDATE_CODES = {
    "151211910000": "AYÇİÇEK HAM",
    "151219900011": "AYÇİÇEK RAFİNE",
    # Kullanıcının verdiği 150710900019 / 150790900019 TÜİK'te bulunamadı —
    # 1507 başlığı prefix-search ile tarandı, gerçek kodların son eki "19"
    # değil "00" imiş; doğrulanmış kodlar aşağıda.
    "150710900000": "SOYA HAM",
    "150790900000": "SOYA RAFİNE",
    "151521900000": "MISIR HAM",
    "151529900000": "MISIR RAFİNE",
}


def main() -> None:
    codes = list(CANDIDATE_CODES.keys())
    print(f"Sorgulanan kodlar: {codes}", file=sys.stderr)

    try:
        records = fetch_trade_stats(codes)
    except QlikClientError as exc:
        print(f"HATA: {exc}", file=sys.stderr)
        raise SystemExit(1)

    print(f"\nToplam satır: {len(records)}")

    found_codes = {r["gtip_code"] for r in records}
    print("\n=== Kod eşleşme kontrolü ===")
    for code, my_label in CANDIDATE_CODES.items():
        if code in found_codes:
            desc = next(r["gtip_description"] for r in records if r["gtip_code"] == code)
            print(f"BULUNDU  {code}  (benim etiketim: {my_label!r})  ->  TÜİK açıklaması: {desc!r}")
        else:
            print(f"BULUNAMADI  {code}  (benim etiketim: {my_label!r}) — TÜİK sisteminde bu kod için hiç kayıt yok")

    print("\n=== Kod başına özet (tüm yıllar toplamı) ===")
    by_code = collections.defaultdict(lambda: {"export_usd": 0.0, "import_usd": 0.0, "export_kg": 0.0, "import_kg": 0.0, "years": set(), "countries": set()})
    for r in records:
        agg = by_code[r["gtip_code"]]
        if r["flow"] == "export":
            agg["export_usd"] += r["value_usd"] or 0
            agg["export_kg"] += r["weight_kg"] or 0
        else:
            agg["import_usd"] += r["value_usd"] or 0
            agg["import_kg"] += r["weight_kg"] or 0
        if r["period_year"]:
            agg["years"].add(r["period_year"])
        if r["country_name"]:
            agg["countries"].add(r["country_name"])

    for code, my_label in CANDIDATE_CODES.items():
        agg = by_code.get(code)
        if not agg:
            continue
        years = sorted(agg["years"])
        print(f"\n{code} ({my_label}):")
        print(f"  Yıl aralığı: {years[0] if years else '-'} - {years[-1] if years else '-'}  ({len(years)} yıl)")
        print(f"  Ülke sayısı: {len(agg['countries'])}")
        print(f"  Toplam İhracat: ${agg['export_usd']:,.0f}  /  {agg['export_kg']/1000:,.0f} ton")
        print(f"  Toplam İthalat: ${agg['import_usd']:,.0f}  /  {agg['import_kg']/1000:,.0f} ton")

    latest_year = max((r["period_year"] for r in records if r["period_year"]), default=None)
    if latest_year:
        print(f"\n=== En son yıl ({latest_year}) kod bazlı kırılım ===")
        latest_by_code = collections.defaultdict(lambda: {"export_usd": 0.0, "import_usd": 0.0})
        for r in records:
            if r["period_year"] != latest_year:
                continue
            agg = latest_by_code[r["gtip_code"]]
            if r["flow"] == "export":
                agg["export_usd"] += r["value_usd"] or 0
            else:
                agg["import_usd"] += r["value_usd"] or 0
        for code, my_label in CANDIDATE_CODES.items():
            agg = latest_by_code.get(code)
            if agg:
                print(f"  {code} ({my_label}): İhracat ${agg['export_usd']:,.0f} / İthalat ${agg['import_usd']:,.0f}")


if __name__ == "__main__":
    main()
