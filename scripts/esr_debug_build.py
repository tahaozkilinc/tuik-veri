"""Geçici doğrulama scripti — esr.records.build_records() gerçek API'ye
karşı doğru şekilde çalışıyor mu kontrol eder (Supabase'e yazmaz)."""
from collections import Counter
from esr import records

recs = records.build_records()
print("total records:", len(recs))

by_commodity = Counter(r["commodity_name_tr"] for r in recs)
print("per commodity:", dict(by_commodity))

by_commodity_my = {}
for r in recs:
    by_commodity_my.setdefault(r["commodity_name_tr"], set()).add(r["marketing_year"])
print("marketing years per commodity:", {k: sorted(v) for k, v in by_commodity_my.items()})

# Türkiye'ye mısır satışı var mı kontrol et
turkey_corn = [r for r in recs if r["commodity_code"] == 401 and r["country_name"].strip().upper() == "TURKEY"]
print("\nTurkey corn rows:", len(turkey_corn))
if turkey_corn:
    turkey_corn.sort(key=lambda r: r["week_ending"])
    print("latest Turkey corn row:", turkey_corn[-1])
    print("accumulated so far:", turkey_corn[-1]["accumulated_exports_ton"], "ton")

# en güncel haftayı bul (mısır)
corn_rows = [r for r in recs if r["commodity_code"] == 401]
latest_week = max(r["week_ending"] for r in corn_rows)
print("\nlatest corn week_ending:", latest_week)
world_total_latest = sum(r["weekly_exports_ton"] for r in corn_rows if r["week_ending"] == latest_week)
print("sum of weekly_exports_ton across all countries for latest week (sanity check):", world_total_latest)

import json
print("\nsample record:", json.dumps(recs[0], indent=2, default=str))
