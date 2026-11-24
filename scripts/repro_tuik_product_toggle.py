"""Kullanıcı şikayeti: TÜİK dış ticaret panelinde birden fazla ürün seçip
sonra tekrar tek ürüne dönünce rapor/tablo "şaşırıyor" (hatalı/bozuk
görünüyor). Canlı sitede gerçek bir tarayıcıyla adım adım tekrar üretip
konsol hatalarını + KPI/tablo/grafik içeriğini her adımda loglar.
Hiçbir şey yazmaz, sadece okur."""

from __future__ import annotations

import json

from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"


def snapshot(page, label: str) -> None:
    print(f"\n=== {label} ===")
    active_chips = page.eval_on_selector_all(
        "#product-chips .chip.active", "els => els.map(el => el.textContent.trim())"
    )
    print("aktif ürün çipleri:", active_chips)

    kpis = page.eval_on_selector_all(
        "#kpi-row .stat-tile", "els => els.map(el => el.textContent.replace(/\\s+/g, ' ').trim())"
    )
    print("KPI kutuları:", kpis)

    legend = page.eval_on_selector_all(
        "#trend-legend .key", "els => els.map(el => el.textContent.trim())"
    )
    print("trend legend (", len(legend), "):", legend)

    series_lines = page.eval_on_selector_all(
        "#trend-chart .series-line", "els => els.length"
    )
    print("trend-chart çizgi sayısı:", series_lines)

    table_rows = page.eval_on_selector_all(
        "#pivot-tbody tr", "els => els.slice(0, 5).map(el => el.textContent.replace(/\\s+/g, ' ').trim())"
    )
    print("tablo ilk 5 satır:", table_rows)
    table_row_count = page.eval_on_selector_all("#pivot-tbody tr", "els => els.length")
    print("tablo toplam satır:", table_row_count)


def main() -> None:
    console_errors = []
    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 1000})
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))

        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1500)

        snapshot(page, "başlangıç (varsayılan: Mısır tek seçili)")

        # birden fazla ürün seç: Soya Fasulyesi + Ayçiçek Ham da ekle
        for text in ["SOYA FASULYESİ", "AYÇİÇEK HAM"]:
            chip = page.locator("#product-chips .chip", has_text=text).first
            chip.click()
            page.wait_for_timeout(400)
        snapshot(page, "3 ürün seçili (Mısır + Soya Fasulyesi + Ayçiçek Ham)")

        # şimdi Soya Fasulyesi + Ayçiçek Ham'ı kaldırıp sadece Mısır'a dön
        for text in ["SOYA FASULYESİ", "AYÇİÇEK HAM"]:
            chip = page.locator("#product-chips .chip", has_text=text).first
            chip.click()
            page.wait_for_timeout(400)
        snapshot(page, "tekrar tek ürün (sadece Mısır)")

        print("\n=== konsol HATALARI ===")
        print(json.dumps(console_errors, indent=2, ensure_ascii=False))
        print("\n=== sayfa (uncaught) HATALARI ===")
        print(json.dumps(page_errors, indent=2, ensure_ascii=False))

        browser.close()


if __name__ == "__main__":
    main()
