"""Geçici teşhis scripti #4 — yeniden yazılan dinamik parser'ı GERÇEK Ekim
2026 WASDE yayınına karşı doğrular."""
from collections import Counter
from wasde import parser, records

report_date, txt_url = parser.find_latest_release()
print("release:", report_date, txt_url)
text = parser.fetch(txt_url)
release_number = parser.extract_release_number(text)
print("WASDE-", release_number, len(text), "chars")

periods, corn_rows = parser.parse_us_corn(text)
print("US corn periods:", periods)
print("Area Planted:", corn_rows.get("Area Planted"))

world_corn, slots = parser.parse_world_corn(text)
print("world corn slots:", slots)
print('world["world"] keys:', list(world_corn["world"].keys()))
print('world["united_states"]:', world_corn["united_states"])

recs = records.build_records(text, report_date, release_number)
print("\ntotal records:", len(recs))
c = Counter(r["measure"] for r in recs)
print("ending_stocks:", c.get("ending_stocks"))
print("mom:", c.get("ending_stocks_mom_change_pct"))
print("yoy:", c.get("ending_stocks_yoy_change_pct"))

mom = [r for r in recs if r["measure"] == "ending_stocks_mom_change_pct"]
for r in mom:
    print(" mom", r["commodity"], r["scope"], r["region"], r["period_label"], r["value"])
yoy = [r for r in recs if r["measure"] == "ending_stocks_yoy_change_pct"]
for r in yoy:
    print(" yoy", r["commodity"], r["scope"], r["region"], r["period_label"], r["value"])

assert all("_period_slot" not in r for r in recs), "leftover _period_slot!"
print("\nOK: no leftover _period_slot keys")

# cross-check: US corn ending_stocks slot=proj_latest value should match
# the World table's united_states region ending_stocks for the same period
us_corn_es = [r for r in recs if r["measure"] == "ending_stocks" and r["scope"] == "us" and r["commodity"] == "corn"]
print("\nUS corn ending_stocks (period -> value):")
for r in us_corn_es:
    print(" ", r["period_label"], "->", r["value"])
