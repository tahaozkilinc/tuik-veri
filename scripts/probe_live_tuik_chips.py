"""Canlı GH Pages sitesinde TÜİK dış ticaret panelindeki ürün çiplerinin
GERÇEKTE nasıl render edildiğini (sıra + satır/konum) ve varsayılan
Yön/Ürün seçimini doğrulamak için tek seferlik araştırma script'i.
Hiçbir şey yazmaz, sadece okur."""

from __future__ import annotations

from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1366, "height": 900})
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1500)

        chips = page.eval_on_selector_all(
            "#product-chips .chip",
            "els => els.map(el => ({text: el.textContent.trim(), rect: el.getBoundingClientRect(), active: el.classList.contains('active')}))",
        )
        print(f"çip sayısı: {len(chips)}")
        for c in chips:
            print(f"  '{c['text']}' active={c['active']} top={c['rect']['top']:.0f} left={c['rect']['left']:.0f}")

        flow_buttons = page.eval_on_selector_all(
            "#flow-filter .seg",
            "els => els.map(el => ({text: el.textContent.trim(), value: el.dataset.value, active: el.classList.contains('active')}))",
        )
        print("\nyön filtresi butonları:")
        for b in flow_buttons:
            print(f"  {b}")

        wrap_rect = page.eval_on_selector("#product-chips", "el => el.getBoundingClientRect()")
        print(f"\n#product-chips kutu genişliği: {wrap_rect['width']:.0f}px")

        browser.close()


if __name__ == "__main__":
    main()
