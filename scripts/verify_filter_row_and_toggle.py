"""Doğrulama: Özet sayfalarında (1) 'Seçili Gün' artık filtre satırının
içinde (Tarih Aralığı/Hızlı Seçim ile aynı <section class="filters">
elemanının çocuğu) mi, (2) 'Ürün: Mısır/Ayçiçek' geçiş düğmesi çalışıyor
mu (Ayçiçek'e tıklayınca Özet (Ayçiçek) sekmesi açılıyor mu ve tersi).
Hiçbir şey yazmaz, sadece okur."""

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
        page.wait_for_timeout(1000)
        page.click("#tab-exchange")
        page.wait_for_timeout(500)

        print("=== Özet (Mısır): filtre satırı yapısı ===")
        is_child_of_filters = page.eval_on_selector(
            "#exchange-summary-selected-day",
            "el => el.closest('section.filters') !== null",
        )
        print("seçili-gün grubu <section class='filters'> içinde mi:", is_child_of_filters)
        commodity_buttons = page.eval_on_selector_all(
            "#exchange-summary-commodity-toggle .seg",
            "els => els.map(el => ({text: el.textContent.trim(), active: el.classList.contains('active')}))",
        )
        print("ürün geçiş düğmeleri:", commodity_buttons)

        print("\n=== grafikte bir noktaya tıkla, bandın konumunu kontrol et ===")
        rect = page.query_selector("#exchange-summary-chart g rect")
        if rect:
            rect.click(force=True)
            page.wait_for_timeout(400)
            hidden = page.eval_on_selector("#exchange-summary-selected-day", "el => el.hidden")
            text = page.eval_on_selector("#exchange-summary-selected-day-text", "el => el.textContent")
            bbox_filters = page.eval_on_selector("#exchange-summary-section section.filters", "el => { const r = el.getBoundingClientRect(); return {top: r.top, bottom: r.bottom}; }")
            bbox_day = page.eval_on_selector("#exchange-summary-selected-day", "el => { const r = el.getBoundingClientRect(); return {top: r.top, bottom: r.bottom}; }")
            print("bant gizli mi:", hidden, "| metin:", text)
            print("filtre satırı dikey sınırları:", bbox_filters)
            print("seçili-gün grubu dikey sınırları (filtre satırıyla örtüşmeli):", bbox_day)
            page.click("#exchange-summary-selected-day-clear")
            page.wait_for_timeout(300)

        print("\n=== Ürün geçişi: Ayçiçek'e tıkla ===")
        page.click('#exchange-summary-commodity-toggle .seg[data-commodity="aycicek"]')
        page.wait_for_timeout(1000)
        active_subtab = page.eval_on_selector("#subtab-summary-aycicek", "el => el.classList.contains('active')")
        section_visible = page.eval_on_selector("#exchange-summary-aycicek-section", "el => !el.hidden")
        aycicek_toggle_state = page.eval_on_selector_all(
            "#exchange-summary-aycicek-commodity-toggle .seg",
            "els => els.map(el => ({text: el.textContent.trim(), active: el.classList.contains('active')}))",
        )
        print("subtab-summary-aycicek aktif mi:", active_subtab, "| bölüm görünür mü:", section_visible)
        print("Ayçiçek sayfasındaki ürün düğmeleri durumu:", aycicek_toggle_state)

        print("\n=== Ürün geçişi: Ayçiçek sayfasından Mısır'a geri dön ===")
        page.click('#exchange-summary-aycicek-commodity-toggle .seg[data-commodity="misir"]')
        page.wait_for_timeout(1000)
        active_subtab2 = page.eval_on_selector("#subtab-summary", "el => el.classList.contains('active')")
        section_visible2 = page.eval_on_selector("#exchange-summary-section", "el => !el.hidden")
        print("subtab-summary aktif mi:", active_subtab2, "| bölüm görünür mü:", section_visible2)

        print("\n=== konsol HATALARI ===")
        print(json.dumps(console_errors, indent=2, ensure_ascii=False))
        print("\n=== sayfa (uncaught) HATALARI ===")
        print(json.dumps(page_errors, indent=2, ensure_ascii=False))

        browser.close()


if __name__ == "__main__":
    main()
