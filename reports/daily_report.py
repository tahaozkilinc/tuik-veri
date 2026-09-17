"""trade_stats tablosundan günlük özet rapor (markdown) üretir:
GTİP ve liman kırılımında en güncel dönem + year-over-year karşılaştırma.
"""

from __future__ import annotations

from datetime import date

from supabase import Client


def _fetch_period(client: Client, year: int, flow: str) -> list[dict]:
    resp = (
        client.table("trade_stats")
        .select("*")
        .eq("period_year", year)
        .eq("flow", flow)
        .execute()
    )
    return resp.data or []


def _sum_value(rows: list[dict]) -> float:
    return sum(r.get("value_usd") or 0 for r in rows)


def _top_n(rows: list[dict], key: str, n: int = 5) -> list[tuple[str, float]]:
    totals: dict[str, float] = {}
    for r in rows:
        k = r.get(key) or "bilinmiyor"
        totals[k] = totals.get(k, 0) + (r.get("value_usd") or 0)
    return sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:n]


def build_report(client: Client, current_year: int) -> str:
    prev_year = current_year - 1
    lines = [f"# Günlük Dış Ticaret Raporu — {date.today().isoformat()}", ""]

    for flow, label in (("export", "İhracat"), ("import", "İthalat")):
        cur_rows = _fetch_period(client, current_year, flow)
        prev_rows = _fetch_period(client, prev_year, flow)
        cur_total = _sum_value(cur_rows)
        prev_total = _sum_value(prev_rows)
        yoy = ((cur_total - prev_total) / prev_total * 100) if prev_total else None

        lines.append(f"## {label} ({current_year})")
        lines.append(f"- Toplam: **${cur_total:,.0f}**")
        if yoy is not None:
            arrow = "▲" if yoy >= 0 else "▼"
            lines.append(f"- Yıllık değişim (YoY vs {prev_year}): {arrow} {yoy:+.1f}%")
        lines.append("")

        lines.append("### GTİP bazında ilk 5")
        for gtip, value in _top_n(cur_rows, "gtip_code"):
            lines.append(f"- {gtip}: ${value:,.0f}")
        lines.append("")

        lines.append("### Liman bazında ilk 5")
        for port, value in _top_n(cur_rows, "port_name"):
            lines.append(f"- {port}: ${value:,.0f}")
        lines.append("")

    return "\n".join(lines)
