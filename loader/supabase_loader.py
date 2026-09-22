"""Normalize edilmiş kayıtları Supabase'e (service role key ile) upsert eder."""

from __future__ import annotations

import os

from supabase import Client, create_client

BATCH_SIZE = 500


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, service_key)


def replace_trade_stats(client: Client, gtip_codes: list[str], records: list[dict]) -> int:
    """Bu GTİP kodlarına ait TÜM eski satırları silip yeni veriyi ekler.

    Neden upsert değil: `.upsert(..., on_conflict=...)` yalnızca o sütun
    kümesini kapsayan bir unique constraint gerçekten DB'de kuruluysa
    çalışır — production'da bunu doğrulamak için doğrudan SQL erişimimiz
    yok, ve canlıda tam da bunun bozuk olduğu görüldü: her scrape
    ON CONFLICT'i hiç eşleştirmeden aynı satırları tekrar tekrar INSERT
    etti (8554 satır sessizce 17108'e, hepsi birebir aynı value/weight
    ile, katlandı). Kaynak zaten bu kodların TAM geçmişini (1996-bugün)
    her çalıştırmada döndürüyor — kısmi/artımlı değil — o yüzden
    sil-ve-ekle hem daha basit hem DB constraint'inin doğru kurulu olup
    olmamasından bağımsız olarak kopya birikmesini imkansız kılıyor.
    """
    if gtip_codes:
        client.table("trade_stats").delete().in_("gtip_code", gtip_codes).execute()
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("trade_stats").insert(batch).execute()
        total += len(batch)
    return total


def replace_wasde_report(client: Client, report_date: str, records: list[dict]) -> int:
    """Sadece bu `report_date`'e (WASDE'nin kendi yayın tarihi) ait eski
    satırları silip yeni veriyi ekler — trade_stats'taki sil-ve-ekle deseniyle
    aynı mantık, ama kapsam SADECE bu aya sınırlı: önceki ayların rakamları
    hiç dokunulmadan kalır, böylece "bu ay geçen aya göre nasıl revize
    edildi" karşılaştırması zaman içinde DB'de birikir.
    """
    client.table("wasde_stats").delete().eq("report_date", report_date).execute()
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("wasde_stats").insert(batch).execute()
        total += len(batch)
    return total


def start_run(client: Client, source: str = "tuik") -> int:
    resp = client.table("scrape_runs").insert({"status": "running", "source": source}).execute()
    return resp.data[0]["id"]


def finish_run(client: Client, run_id: int, status: str, rows_upserted: int | None = None, error_message: str | None = None) -> None:
    client.table("scrape_runs").update(
        {
            "status": status,
            "finished_at": "now()",
            "rows_upserted": rows_upserted,
            "error_message": error_message,
        }
    ).eq("id", run_id).execute()


def save_daily_report(client: Client, report_date: str, summary_md: str) -> None:
    client.table("daily_reports").upsert(
        {"report_date": report_date, "summary_md": summary_md},
        on_conflict="report_date",
    ).execute()
