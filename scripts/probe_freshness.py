"""Geçici: her tablonun en güncel tarihi + her görevin son çalışmaları."""
import os, sys
sys.path.insert(0, ".")
from supabase import create_client

c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

def latest(table, col, extra=None):
    q = c.table(table).select(col)
    if extra:
        q = extra(q)
    r = q.order(col, desc=True).limit(1).execute().data
    n = c.table(table).select(col, count="exact").limit(1).execute().count
    return (r[0][col] if r else None), n

print("trade_stats en son dönem:", c.table("trade_stats").select("period_year,period_month").order("period_year", desc=True).order("period_month", desc=True).limit(1).execute().data,
      "satır:", c.table("trade_stats").select("id", count="exact").limit(1).execute().count)
# GTİP başına son dönem (PostgREST 1000 satır sınırına takılmamak için tek tek)
from collections import defaultdict
codes = sorted({r["gtip_code"] for r in c.table("trade_stats").select("gtip_code").gte("period_year", 2025).limit(1000).execute().data})
for g in codes:
    r = c.table("trade_stats").select("period_year,period_month").eq("gtip_code", g).order("period_year", desc=True).order("period_month", desc=True).limit(1).execute().data
    print("  GTİP", g, "son dönem:", r)
print("daily_reports son:", c.table("daily_reports").select("report_date").order("report_date", desc=True).limit(1).execute().data)
for t, col in [("turib_bulletin", "trade_date"), ("uztb_fiyat", "trade_date"), ("ktb_bulletin", "trade_date"), ("gtb_fiyat", "trade_date"),
               ("ptb_fiyat", "trade_date"), ("ctb_fiyat", "trade_date"), ("tcmb_usd_try", "trade_date"), ("etb_fiyat", "trade_date"),
               ("edtb_fiyat", "trade_date"), ("wasde_stats", "report_date"), ("export_sales_stats", "week_ending")]:
    try:
        print(f"{t}: en son {col} =", *latest(t, col))
    except Exception as e:
        print(f"{t}: HATA {str(e)[:150]}")

runs = c.table("scrape_runs").select("source,status,started_at,finished_at,rows_upserted,error_message").order("started_at", desc=True).limit(400).execute().data
seen = defaultdict(list)
for r in runs:
    if len(seen[r["source"]]) < 4:
        seen[r["source"]].append(r)
for src, rs in sorted(seen.items()):
    print(f"\n== {src}")
    for r in rs:
        print(f"   {r['started_at'][:16]} {r['status']:8} rows={r['rows_upserted']} err={(r['error_message'] or '')[:160]}")
