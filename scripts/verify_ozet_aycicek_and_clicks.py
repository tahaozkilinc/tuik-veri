"""Bugünkü değişiklikleri canlı sitede doğrulayan kapsamlı test:
  1) PTB varsayılan ürün grubu Mısır, ÇTB varsayılan ürün grubu Ayçiçeği mi?
  2) PTB/ÇTB varsayılan tarih penceresi "Son 90 Gün" mü?
  3) Yeni "Özet (Ayçiçek)" alt sekmesi var mı, veri yükleniyor mu (KPI'lar
     "—" değil mi)?
  4) Özet (Mısır) sayfasında grafikte bir noktaya tıklayınca "Seçili gün"
     bandı çıkıyor mu, KPI'lar değişiyor mu, "Bugüne dön" sıfırlıyor mu?
  5) Aynı testi Özet (Ayçiçek) sayfasında da tekrar et.
Hiçbir şey yazmaz, sadece okur. Konsol/sayfa hatalarını da raporlar.
"""

from __future__ import annotations

import json

from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"


def main() -> None:
    console_errors = []
    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 1100})
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: page_errors.append(str(exc)))

        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1000)
        page.click("#tab-exchange")
        page.wait_for_timeout(500)

        print("=== 1) PTB varsayılan ürün grubu ===")
        page.click("#subtab-ptb")
        page.wait_for_timeout(2000)
        ptb_group = page.eval_on_selector("#ptb-product-group .chip.active", "el => el ? el.textContent.trim() : null")
        ptb_preset = page.eval_on_selector("#ptb-period-presets .seg.active", "el => el ? el.textContent.trim() : null")
        print("PTB aktif ürün grubu:", ptb_group, "| aktif dönem:", ptb_preset)

        print("\n=== 2) ÇTB varsayılan ürün grubu ===")
        page.click("#subtab-ctb")
        page.wait_for_timeout(2000)
        ctb_group = page.eval_on_selector("#ctb-product-group .chip.active", "el => el ? el.textContent.trim() : null")
        ctb_preset = page.eval_on_selector("#ctb-period-presets .seg.active", "el => el ? el.textContent.trim() : null")
        print("ÇTB aktif ürün grubu:", ctb_group, "| aktif dönem:", ctb_preset)

        print("\n=== 3) Özet (Ayçiçek) sekmesi ===")
        subtab_exists = page.query_selector("#subtab-summary-aycicek") is not None
        print("subtab-summary-aycicek var mı:", subtab_exists)
        if subtab_exists:
            page.click("#subtab-summary-aycicek")
            page.wait_for_timeout(2500)
            kpis = page.eval_on_selector_all("#exchange-summary-aycicek-kpi-row .stat-tile", "els => els.map(el => el.textContent.replace(/\\s+/g,' ').trim())")
            print("Ayçiçek KPI kutuları:", kpis)
            asof = page.eval_on_selector("#exchange-summary-aycicek-asof-badge", "el => el.textContent")
            print("Ayçiçek son veri rozeti:", asof)
            table_rows = page.eval_on_selector_all("#exchange-summary-aycicek-tbody tr", "els => els.length")
            print("Ayçiçek tablo satır sayısı:", table_rows)

            print("\n=== 4) Ayçiçek: grafikte bir noktaya tıkla ===")
            bar_before = page.eval_on_selector("#exchange-summary-aycicek-selected-day", "el => el.hidden")
            print("tıklamadan önce seçili-gün bandı gizli mi:", bar_before)
            rect = page.query_selector("#exchange-summary-aycicek-chart g rect")
            if rect:
                rect.click(force=True)
                page.wait_for_timeout(500)
                bar_after = page.eval_on_selector("#exchange-summary-aycicek-selected-day", "el => el.hidden")
                bar_text = page.eval_on_selector("#exchange-summary-aycicek-selected-day-text", "el => el.textContent")
                print("tıkladıktan sonra bant gizli mi:", bar_after, "| metin:", bar_text)
                page.click("#exchange-summary-aycicek-selected-day-clear")
                page.wait_for_timeout(300)
                bar_cleared = page.eval_on_selector("#exchange-summary-aycicek-selected-day", "el => el.hidden")
                print("'Bugüne dön' sonrası bant gizli mi (true olmalı):", bar_cleared)
            else:
                print("UYARI: grafikte tıklanacak nokta bulunamadı (veri boş olabilir)")

        print("\n=== 5) Özet (Mısır): grafikte bir noktaya tıkla ===")
        page.click("#subtab-summary")
        page.wait_for_timeout(1500)
        bar_before = page.eval_on_selector("#exchange-summary-selected-day", "el => el.hidden")
        print("tıklamadan önce bant gizli mi:", bar_before)
        rect = page.query_selector("#exchange-summary-chart g rect")
        if rect:
            rect.click(force=True)
            page.wait_for_timeout(500)
            bar_after = page.eval_on_selector("#exchange-summary-selected-day", "el => el.hidden")
            bar_text = page.eval_on_selector("#exchange-summary-selected-day-text", "el => el.textContent")
            kpis_after_click = page.eval_on_selector_all("#exchange-summary-kpi-row .stat-tile", "els => els.map(el => el.textContent.replace(/\\s+/g,' ').trim())")
            print("tıkladıktan sonra bant gizli mi:", bar_after, "| metin:", bar_text)
            print("tıklanan güne göre KPI'lar:", kpis_after_click)
            page.click("#exchange-summary-selected-day-clear")
            page.wait_for_timeout(300)
            bar_cleared = page.eval_on_selector("#exchange-summary-selected-day", "el => el.hidden")
            print("'Bugüne dön' sonrası bant gizli mi (true olmalı):", bar_cleared)
        else:
            print("UYARI: grafikte tıklanacak nokta bulunamadı")

        print("\n=== konsol HATALARI ===")
        print(json.dumps(console_errors, indent=2, ensure_ascii=False))
        print("\n=== sayfa (uncaught) HATALARI ===")
        print(json.dumps(page_errors, indent=2, ensure_ascii=False))

        browser.close()


if __name__ == "__main__":
    main()
