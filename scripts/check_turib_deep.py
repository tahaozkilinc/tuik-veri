"""TÜRİB'de kullanıcının 'hala sıkıntı var' dediği şeyi bulmak için derin
kontrol: son scrape_runs kayıtları (hata var mı), kopya satır kontrolü,
en güncel tarih, ve örnek satırların alan bütünlüğü (null/boş kritik alan)."""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from loader.supabase_loader import get_client


def main() -> None:
    client = get_client()

    print("=== son 10 turib scrape_runs ===")
    runs = (
        client.table("scrape_runs")
        .select("*")
        .eq("source", "turib")
        .order("id", desc=True)
        .limit(10)
        .execute()
    )
    for r in runs.data or []:
        print(f"  id={r['id']} status={r['status']} rows_upserted={r.get('rows_upserted')} "
              f"started={r.get('started_at')} finished={r.get('finished_at')} error={r.get('error_message')}")

    print("\n=== turib_bulletin: tüm satırlar (kopya + null kontrolü) ===")
    all_rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            client.table("turib_bulletin")
            .select("trade_date,isin_kodu,enstruman_sinifi,agirlikli_ortalama_fiyat,en_dusuk,en_yuksek,"
                     "islem_adedi,islem_miktari_kg,lidas_adi")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    print(f"toplam satır: {len(all_rows)}")

    key_counts = Counter((r["trade_date"], r["isin_kodu"]) for r in all_rows)
    dupes = {k: c for k, c in key_counts.items() if c > 1}
    print(f"kopya (trade_date, isin_kodu) anahtar sayısı: {len(dupes)}")
    for k, c in list(dupes.items())[:10]:
        print(f"  KOPYA: {k} -> {c} kez")

    null_issues = []
    for r in all_rows:
        if not r.get("enstruman_sinifi"):
            null_issues.append(("enstruman_sinifi eksik", r))
        if r.get("agirlikli_ortalama_fiyat") is None:
            null_issues.append(("agirlikli_ortalama_fiyat eksik", r))
    print(f"şüpheli/eksik alan sayısı: {len(null_issues)}")
    for reason, r in null_issues[:10]:
        print(f"  {reason}: {r}")

    dates = sorted({r["trade_date"] for r in all_rows})
    print(f"\nen eski: {dates[0]}  en yeni: {dates[-1]}")
    print("son 10 gün:")
    for d in dates[-10:]:
        print(f"  {d}: {sum(1 for r in all_rows if r['trade_date'] == d)} satır")


if __name__ == "__main__":
    main()
