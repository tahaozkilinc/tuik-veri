"""Normalize edilmiş kayıtları Supabase'e (service role key ile) upsert eder."""

from __future__ import annotations

import os

from supabase import Client, create_client

BATCH_SIZE = 500


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, service_key)


def upsert_trade_stats(client: Client, records: list[dict]) -> int:
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        client.table("trade_stats").upsert(
            batch,
            on_conflict="period_year,period_month,flow,gtip_code,port_code,country_code",
        ).execute()
        total += len(batch)
    return total


def start_run(client: Client) -> int:
    resp = client.table("scrape_runs").insert({"status": "running"}).execute()
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
