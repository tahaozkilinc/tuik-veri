"""Geçici teşhis scripti — Ekim 2026 WASDE yayınının gerçek metin yapısını
ve mevcut parser'ın bunun karşısında ne ürettiğini inceler. Sil-ve-kullan,
production kodunun bir parçası değil."""
from wasde import parser, records

report_date, txt_url = parser.find_latest_release()
print("release:", report_date, txt_url)
text = parser.fetch(txt_url)
release_number = parser.extract_release_number(text)
print("WASDE-", release_number, len(text), "chars")

# --- 1. Dünya Mısır tablosunun "Proj." bölümünün ham metnini göster ---
ti, end2 = parser.find_block(text, "World Corn Supply and Use")
block = text[ti:end2]
iproj = block.find("2026/27 Proj.")
print("\n--- World Corn, Proj. section raw (first 1200 chars) ---")
print(block[iproj:iproj+1200])

# --- 2. ABD mısır tablosunun başlık/sütun satırlarını göster ---
ti2, end3 = parser.find_block(text, "U.S. Feed Grain and Corn Supply and Use")
usblock = text[ti2:end3]
print("\n--- US Corn block, first 900 chars (header/columns) ---")
print(usblock[:900])

# --- 3. Mevcut parser'ın gerçekten ne döndürdüğünü say ---
world_corn = parser.parse_world_corn(text)
print("\n--- parse_world_corn() region keys & period keys ---")
for region, series in world_corn.items():
    print(region, "->", list(series.keys()))

recs = records.build_records(text, report_date, release_number)
print("\ntotal records:", len(recs))
from collections import Counter
measure_counts = Counter(r["measure"] for r in recs)
print("ending_stocks:", measure_counts.get("ending_stocks"))
print("ending_stocks_mom_change_pct:", measure_counts.get("ending_stocks_mom_change_pct"))
print("ending_stocks_yoy_change_pct:", measure_counts.get("ending_stocks_yoy_change_pct"))

us_corn_es = [r for r in recs if r["measure"] == "ending_stocks" and r["scope"] == "us" and r["commodity"] == "corn"]
print("\nUS corn ending_stocks records (period_label -> value):")
for r in us_corn_es:
    print(" ", r["period_label"], "->", r["value"])

mom = [r for r in recs if r["measure"] == "ending_stocks_mom_change_pct"]
yoy = [r for r in recs if r["measure"] == "ending_stocks_yoy_change_pct"]
print("\nmom records:", [(r["commodity"], r["scope"], r["region"], r["period_label"], r["value"]) for r in mom])
print("yoy records:", [(r["commodity"], r["scope"], r["region"], r["period_label"], r["value"]) for r in yoy])
