"""Keşif: verilen GTİP öneki (ör. '1507') ile başlayan TÜM kodları ve resmi
açıklamalarını TÜİK Qlik Engine'den listeler — Supabase'e hiçbir şey yazmaz.
Amaç: yanlış tahmin edilmiş bir GTİP kodu için doğrusunu bulmak.
"""

from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scraper.qlik_client import APP_ID, NAV_TIMEOUT_MS, MASHUP_URL, _INIT_SCRIPT, _call, QlikClientError


def search_prefix(prefix: str) -> list[tuple[str, str]]:
    set_expr = f'ISTPOZ={{"{prefix}*"}}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        page.add_init_script(_INIT_SCRIPT)
        try:
            page.goto(MASHUP_URL, wait_until="networkidle", timeout=NAV_TIMEOUT_MS)
            page.wait_for_function(
                "(appIdSubstr) => Object.keys(window.__qlikSockets || {}).some(k => k.indexOf(appIdSubstr) !== -1)",
                arg=APP_ID,
                timeout=NAV_TIMEOUT_MS,
            )
            open_resp = _call(page, "OpenDoc", [APP_ID, "", "", "", False], req_id=91_001)
            doc_handle = open_resp["result"]["qReturn"]["qHandle"]

            hc_resp = _call(
                page,
                "CreateSessionObject",
                [
                    {
                        "qInfo": {"qType": "gtip_search"},
                        "qHyperCubeDef": {
                            "qDimensions": [
                                {"qDef": {"qFieldDefs": ["ISTPOZ"]}},
                                {"qDef": {"qFieldDefs": ["ISTPOZ_ADI"]}},
                            ],
                            "qMeasures": [
                                {"qDef": {"qDef": f"Sum({{<{set_expr}>}} DOLAR)"}},
                            ],
                            "qInitialDataFetch": [],
                        },
                    }
                ],
                handle=doc_handle,
                req_id=91_002,
            )
            hc_handle = hc_resp["result"]["qReturn"]["qHandle"]

            layout_resp = _call(page, "GetLayout", [], handle=hc_handle, req_id=91_003)
            hc = layout_resp["result"]["qLayout"]["qHyperCube"]
            total = hc.get("qSize", {}).get("qcy", 0)
            width = hc.get("qSize", {}).get("qcx", 3)

            rows: list[list[dict]] = []
            page_height = 1000
            top = 0
            req_id = 91_010
            while top < total:
                height = min(page_height, total - top)
                data_resp = _call(
                    page,
                    "GetHyperCubeData",
                    ["/qHyperCubeDef", [{"qLeft": 0, "qTop": top, "qWidth": width, "qHeight": height}]],
                    handle=hc_handle,
                    req_id=req_id,
                )
                req_id += 1
                data_pages = data_resp["result"].get("qDataPages", [])
                matrix = data_pages[0].get("qMatrix", []) if data_pages else []
                if not matrix:
                    break
                rows.extend(matrix)
                top += len(matrix)
        finally:
            browser.close()

    seen = {}
    for row in rows:
        code = row[0].get("qText")
        desc = row[1].get("qText")
        if code and code not in seen:
            seen[code] = desc
    return sorted(seen.items())


def main() -> None:
    prefixes = sys.argv[1:] or ["1507"]
    for prefix in prefixes:
        print(f"\n=== '{prefix}' ile başlayan GTİP kodları ===")
        try:
            results = search_prefix(prefix)
        except QlikClientError as exc:
            print(f"HATA: {exc}", file=sys.stderr)
            continue
        if not results:
            print("  (hiç kod bulunamadı)")
        for code, desc in results:
            print(f"  {code}  ->  {desc}")


if __name__ == "__main__":
    main()
