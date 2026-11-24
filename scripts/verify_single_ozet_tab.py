"""Doğrulama: artık TEK "Özet" üst sekmesi var (Özet (Ayçiçek) üst sekmesi
kalktı), içinde paylaşılan bir "Ürün: Mısır/Ayçiçek" geçiş düğmesiyle
Mısır/Ayçiçek bölümleri arasında geçiliyor. Hiçbir şey yazmaz."""

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
        page.wait_for_timeout(1500)

        subtab_texts = page.eval_on_selector_all(
            "#exchange-subtabs .tab", "els => els.map(el => el.textContent.trim())"
        )
        print("üst alt-sekme düğmeleri:", subtab_texts)

        toggle = page.eval_on_selector_all(
            "#exchange-summary-commodity-toggle .seg",
            "els => els.map(el => ({text: el.textContent.trim(), active: el.classList.contains('active')}))",
        )
        print("Özet içindeki Ürün geçişi:", toggle)

        misir_visible = page.eval_on_selector("#exchange-summary-section", "el => !el.hidden")
        aycicek_hidden = page.eval_on_selector("#exchange-summary-aycicek-section", "el => el.hidden")
        print("başlangıçta Mısır görünür mü:", misir_visible, "| Ayçiçek gizli mi:", aycicek_hidden)

        kpis_misir = page.eval_on_selector_all(
            "#exchange-summary-kpi-row .stat-tile", "els => els.map(el => el.textContent.replace(/\\s+/g,' ').trim())"
        )
        print("Mısır KPI'ları:", kpis_misir)

        print("\n=== Ayçiçek'e tıkla ===")
        page.click('#exchange-summary-commodity-toggle .seg[data-commodity="aycicek"]')
        page.wait_for_timeout(2000)
        misir_hidden2 = page.eval_on_selector("#exchange-summary-section", "el => el.hidden")
        aycicek_visible2 = page.eval_on_selector("#exchange-summary-aycicek-section", "el => !el.hidden")
        print("Mısır gizli mi:", misir_hidden2, "| Ayçiçek görünür mü:", aycicek_visible2)
        kpis_aycicek = page.eval_on_selector_all(
            "#exchange-summary-aycicek-kpi-row .stat-tile", "els => els.map(el => el.textContent.replace(/\\s+/g,' ').trim())"
        )
        print("Ayçiçek KPI'ları:", kpis_aycicek)

        print("\n=== Mısır'a geri dön ===")
        page.click('#exchange-summary-commodity-toggle .seg[data-commodity="misir"]')
        page.wait_for_timeout(500)
        misir_visible3 = page.eval_on_selector("#exchange-summary-section", "el => !el.hidden")
        aycicek_hidden3 = page.eval_on_selector("#exchange-summary-aycicek-section", "el => el.hidden")
        print("Mısır görünür mü:", misir_visible3, "| Ayçiçek gizli mi:", aycicek_hidden3)

        print("\n=== TÜRİB sekmesine geçip geri Özet'e dön (sectionId doğru mu) ===")
        page.click("#subtab-turib")
        page.wait_for_timeout(800)
        page.click("#subtab-summary")
        page.wait_for_timeout(500)
        outer_visible = page.eval_on_selector("#exchange-summary-outer", "el => !el.hidden")
        print("Özet'e dönünce exchange-summary-outer görünür mü:", outer_visible)

        print("\n=== konsol HATALARI ===")
        print(json.dumps(console_errors, indent=2, ensure_ascii=False))
        print("\n=== sayfa (uncaught) HATALARI ===")
        print(json.dumps(page_errors, indent=2, ensure_ascii=False))

        browser.close()


if __name__ == "__main__":
    main()
