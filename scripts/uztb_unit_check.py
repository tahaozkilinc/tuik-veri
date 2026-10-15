"""temp: print raw UZTB fiyat values to confirm unit (TL/kg vs TL/ton)."""
from uztb.client import fetch_today_rows, fetch_daily_summary

rows = fetch_today_rows("99992")
print("today rows sample:", rows[:3])

summary = fetch_daily_summary("99992")
print("summary sample:", summary[:5])
