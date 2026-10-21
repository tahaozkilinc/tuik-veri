"""Geçici araştırma scripti #3: gtb/client.py + gtb/records.py'nin gerçek
GTB sayfasına karşı doğru çalıştığını doğrular (urllib ile, Playwright
olmadan) — regex'in canlı HTML'i doğru ayrıştırdığını teyit eder."""
import datetime as dt

from gtb.client import fetch_salon_satis_html, parse_rows
from gtb.records import parse_records

for tarih in ["2026-10-20", "2025-10-21", "2026-10-18"]:
    day = dt.date.fromisoformat(tarih)
    try:
        html = fetch_salon_satis_html(day)
        rows = parse_rows(html)
        recs = parse_records(rows, day)
        print(f"=== {tarih}: {len(rows)} satır ===")
        for r in recs:
            print(r)
    except Exception as exc:
        print(f"{tarih}: HATA — {exc}")
    print()
