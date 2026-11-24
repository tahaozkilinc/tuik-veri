"""Doğrulama: Özet (Mısır) ve Özet (Ayçiçek) filtre satırlarından "Ürün"
geçiş düğmesi kaldırıldı mı, sayfa hâlâ hatasız yükleniyor mu, "Seçili
Gün" göstergesi filtre satırında çalışmaya devam ediyor mu."""

from __future__ import annotations

import json

from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"


def main() -> None:
    console_errors = []
    page_errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 1000})
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))

        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1200)
        page.click("#tab-exchange")
        page.wait_for_timeout(2000)

        print("=== Özet (Mısır) ===")
        toggle_exists = page.query_selector("#exchange-summary-commodity-toggle") is not None
        print("commodity-toggle hâlâ var mı (False olmalı):", toggle_exists)
        filter_groups = page.eval_on_selector_all(
            "#exchange-summary-section section.filters .filter-group",
            "els => els.map(el => el.querySelector('.filter-label')?.textContent?.trim())",
        )
        print("filtre grupları sırasıyla:", filter_groups)

        rect = page.query_selector("#exchange-summary-chart g rect")
        if rect:
            rect.click(force=True)
            page.wait_for_timeout(500)
            hidden = page.eval_on_selector("#exchange-summary-selected-day", "el => el.hidden")
            text = page.eval_on_selector("#exchange-summary-selected-day-text", "el => el.textContent")
            print("tıkladıktan sonra seçili-gün bandı gizli mi:", hidden, "| metin:", text)

        print("\n=== Özet (Ayçiçek) ===")
        page.click("#subtab-summary-aycicek")
        page.wait_for_timeout(1500)
        toggle_exists2 = page.query_selector("#exchange-summary-aycicek-commodity-toggle") is not None
        print("commodity-toggle hâlâ var mı (False olmalı):", toggle_exists2)
        filter_groups2 = page.eval_on_selector_all(
            "#exchange-summary-aycicek-section section.filters .filter-group",
            "els => els.map(el => el.querySelector('.filter-label')?.textContent?.trim())",
        )
        print("filtre grupları sırasıyla:", filter_groups2)

        print("\n=== konsol HATALARI ===")
        print(json.dumps(console_errors, indent=2, ensure_ascii=False))
        print("\n=== sayfa (uncaught) HATALARI ===")
        print(json.dumps(page_errors, indent=2, ensure_ascii=False))

        browser.close()


if __name__ == "__main__":
    main()
