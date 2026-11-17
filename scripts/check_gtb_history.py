"""GTB'nin Supabase'deki gerçek tarih aralığını VE canlı kaynağın (gtb.org.tr)
gerçek geçmiş sınırını doğrulamak için tek seferlik araştırma script'i.
Hiçbir şey yazmaz, sadece okur. Supabase anon key dashboard/config.js'den
(public, sadece SELECT yetkili) — service role gerekmiyor."""

from __future__ import annotations

import datetime as dt
import json
import urllib.request

from gtb import client as gtb_client

SUPABASE_URL = "https://kajilskrmavwqdaipixu.supabase.co"
ANON_KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"


def supa_get(path: str) -> str:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8")


def main() -> None:
    print("=== Supabase gtb_fiyat tarih aralığı ===")
    earliest = json.loads(supa_get("gtb_fiyat?select=trade_date&order=trade_date.asc&limit=5"))
    latest = json.loads(supa_get("gtb_fiyat?select=trade_date&order=trade_date.desc&limit=5"))
    print("en eski 5:", earliest)
    print("en yeni 5:", latest)

    print("\n=== 2025-09 civarı günlük satır sayısı (DB) ===")
    for d in [
        "2025-09-01", "2025-09-08", "2025-09-10", "2025-09-11", "2025-09-12",
        "2025-09-13", "2025-09-14", "2025-09-15", "2025-09-16", "2025-09-17",
        "2025-09-22", "2025-09-29",
    ]:
        rows = json.loads(supa_get(f"gtb_fiyat?select=urun_kodu&trade_date=eq.{d}&limit=1000"))
        print(f"  {d}: DB'de {len(rows)} satır")

    print("\n=== Canlı gtb.org.tr kaynağı — gerçekten o tarihte veri var mı? ===")
    test_dates = [
        "2025-09-01", "2025-09-08", "2025-09-10", "2025-09-11", "2025-09-12",
        "2025-09-13", "2025-09-14", "2025-09-15", "2025-08-01", "2025-07-01",
        "2025-06-01", "2025-01-02", "2024-09-01", "2024-01-02", "2023-09-01",
        "2023-01-02", "2022-09-01", "2022-01-03", "2021-09-01", "2021-01-04",
    ]
    for d_str in test_dates:
        day = dt.date.fromisoformat(d_str)
        try:
            html = gtb_client.fetch_salon_satis_html(day)
            rows = gtb_client.parse_rows(html)
            print(f"  {d_str} ({day.strftime('%a')}): canlı kaynakta {len(rows)} satır")
        except Exception as exc:  # noqa: BLE001
            print(f"  {d_str} ({day.strftime('%a')}): HATA — {exc}")


if __name__ == "__main__":
    main()
