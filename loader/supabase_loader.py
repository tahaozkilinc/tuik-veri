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


def replace_export_sales(client: Client, records: list[dict]) -> int:
    """Bu çalıştırmada çekilen (commodity_code, marketing_year) çiftlerine ait
    eski satırları silip yeni veriyi ekler — WASDE'deki report_date bazlı
    sil-ve-ekle ile aynı mantık (API her çağrıda o çiftin tam/revize
    geçmişini döndürüyor, artımlı değil), kapsam sadece o (emtia, pazarlama
    yılı) çiftleriyle sınırlı.
    """
    pairs = {(r["commodity_code"], r["marketing_year"]) for r in records}
    for commodity_code, marketing_year in pairs:
        client.table("export_sales_stats").delete().eq("commodity_code", commodity_code).eq(
            "marketing_year", marketing_year
        ).execute()
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("export_sales_stats").insert(batch).execute()
        total += len(batch)
    return total


def replace_turib_bulletin(client: Client, trade_date: str, records: list[dict]) -> int:
    """Bu `trade_date`'e ait eski TÜRİB satırlarını silip yeni veriyi ekler —
    WASDE'nin report_date bazlı sil-ve-ekle'siyle aynı mantık: kaynak her
    çalıştırmada o günün tam tablosunu döndürüyor (artımlı değil), kapsam
    sadece bu güne sınırlı.
    """
    client.table("turib_bulletin").delete().eq("trade_date", trade_date).execute()
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("turib_bulletin").insert(batch).execute()
        total += len(batch)
    return total


def replace_uztb_fiyat(client: Client, trade_date: str, urun_kodu: str, record: dict) -> int:
    """Bu (trade_date, urun_kodu) çiftine ait günlük özeti silip yeniden
    yazar — her kayıt zaten bir günün TEK ÖZET satırı (bireysel işlem
    değil), bu yüzden WASDE/export_sales'teki gibi toplu değil tekil
    sil-ve-ekle. Günlük cron, backfill'in bıraktığı rutubetsiz özeti
    gerçek (rutubet dahil) özetle üzerine yazar.
    """
    client.table("uztb_fiyat").delete().eq("trade_date", trade_date).eq("urun_kodu", urun_kodu).execute()
    client.table("uztb_fiyat").insert(record).execute()
    return 1


def replace_ktb_bulletin(client: Client, trade_date: str, records: list[dict]) -> int:
    """Bu `trade_date`'e ait eski KTB satırlarını silip yeni veriyi ekler —
    turib_bulletin ile aynı mantık: kaynak her çağrıda o günün TAM bültenini
    döndürüyor (artımlı değil), kapsam sadece bu güne sınırlı.
    """
    client.table("ktb_bulletin").delete().eq("trade_date", trade_date).execute()
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("ktb_bulletin").insert(batch).execute()
        total += len(batch)
    return total


def replace_gtb_fiyat(client: Client, trade_date: str, records: list[dict]) -> int:
    """Bu `trade_date`'e ait eski GTB satırlarını silip yeni veriyi ekler —
    ktb_bulletin/turib_bulletin ile aynı mantık: kaynak her çağrıda o günün
    TAM tablosunu döndürüyor (artımlı değil), kapsam sadece bu güne sınırlı.
    """
    client.table("gtb_fiyat").delete().eq("trade_date", trade_date).execute()
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("gtb_fiyat").insert(batch).execute()
        total += len(batch)
    return total


def replace_ctb_fiyat(client: Client, trade_date: str, records: list[dict]) -> int:
    """Bu `trade_date`'e ait eski ÇTB satırlarını silip yeni veriyi ekler —
    gtb_fiyat/ktb_bulletin ile aynı mantık: kaynak her çağrıda o günün TAM
    özetini döndürüyor (artımlı değil), kapsam sadece bu güne sınırlı.
    """
    client.table("ctb_fiyat").delete().eq("trade_date", trade_date).execute()
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("ctb_fiyat").insert(batch).execute()
        total += len(batch)
    return total


def replace_ptb_fiyat(client: Client, trade_date: str, records: list[dict]) -> int:
    """Bu `trade_date`'e ait eski PTB satırlarını silip yeni veriyi ekler —
    ctb_fiyat ile aynı mantık.
    """
    client.table("ptb_fiyat").delete().eq("trade_date", trade_date).execute()
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("ptb_fiyat").insert(batch).execute()
        total += len(batch)
    return total


def replace_tcmb_rate(client: Client, trade_date: str, record: dict) -> int:
    """Bu `trade_date`'e ait eski TCMB kur satırını silip yeniden yazar —
    uztb_fiyat'taki tekil sil-ve-ekle ile aynı mantık: her kayıt zaten bir
    günün TEK kuru (TCMB yayınlandıktan sonra değişmez), bu yüzden toplu
    değil tekil sil-ve-ekle.
    """
    client.table("tcmb_usd_try").delete().eq("trade_date", trade_date).execute()
    client.table("tcmb_usd_try").insert(record).execute()
    return 1


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
