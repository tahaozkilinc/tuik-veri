"""PTB/ÇTB'de Ayçiçek ürün adlarının TAM yazımını öğrenmek için tek seferlik
okuma script'i (Özet sayfasına ikinci bir "Ayçiçek" sekmesi eklemek için
GTB'deki gibi TEK bir kanonik varyant seçmemiz gerekiyor). Supabase anon
key (public, sadece SELECT) kullanıyor, hiçbir şey yazmıyor."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

SUPABASE_URL = "https://kajilskrmavwqdaipixu.supabase.co"
ANON_KEY = "sb_publishable_6UslA4U4eYBSQl0RGkAe8g_7qPFuK1M"


def supa_get(path: str) -> list:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def distinct_products(table: str, like: str) -> None:
    q = urllib.parse.quote(f"*{like}*")
    rows = supa_get(f"{table}?select=urun_adi,trade_date&urun_adi=ilike.{q}&order=trade_date.desc&limit=2000")
    counts: dict[str, int] = {}
    latest: dict[str, str] = {}
    for r in rows:
        name = r["urun_adi"]
        counts[name] = counts.get(name, 0) + 1
        if name not in latest or r["trade_date"] > latest[name]:
            latest[name] = r["trade_date"]
    print(f"\n=== {table} ('{like}' içeren ürün adları) ===")
    for name, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {name!r}: {n} satır, en yeni {latest[name]}")


def main() -> None:
    distinct_products("ptb_fiyat", "AYÇİÇE")
    distinct_products("ctb_fiyat", "AYÇİÇE")
    distinct_products("uztb_fiyat", "AYÇİÇE")


if __name__ == "__main__":
    main()
