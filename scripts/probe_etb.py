"""Geçici: ETB/EDTB ayrıştırıcılarını canlı kaynakta veritabanına yazmadan dener."""
import datetime as dt, sys, time
sys.path.insert(0, ".")
from etb import records as ER
from etb.client import EtbSession
from edtb import records as DR
from edtb.client import fetch_daily_list

s = EtbSession()
for d in ["2026-11-25", "2026-11-22", "2026-06-15", "2025-03-12", "2023-01-10"]:
    t0 = time.time()
    try:
        recs = ER.parse_day(s.fetch_day_html(dt.date.fromisoformat(d)), dt.date.fromisoformat(d))
        units = sorted({r["birim"] for r in recs})
        mis = [(r["urun_adi"], r["ort_fiyat"], r["toplam_kilo"]) for r in recs if r["urun_adi"].upper().startswith("MISIR")]
        print(f"ETB {d}: {len(recs)} satır, birimler={units}, mısır={mis} ({time.time()-t0:.1f}s)")
        print("   ürünler:", sorted({r['urun_adi'] for r in recs})[:40])
    except Exception as e:
        print(f"ETB {d}: HATA {e}")

raw = fetch_daily_list()
recs, warns = DR.parse_rows(raw)
print(f"EDTB: ham {len(raw)}, kayıt {len(recs)}, ilk {recs[0]['trade_date']}, son {recs[-1]['trade_date']}, uyarı {len(warns)}")
print("EDTB son 3:", recs[-3:])
print("EDTB uyarılar:", warns[:10])
yil = [r for r in recs if r["trade_date"] >= (dt.date.today() - dt.timedelta(days=366)).isoformat()]
print("EDTB son 1 yıl gün sayısı:", len(yil))
