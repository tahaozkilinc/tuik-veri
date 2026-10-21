"""Geçici araştırma scripti #2: ÇTB ve PTB'nin tarih filtresi FORM/JS
etkileşimiyle nasıl çalışıyor (ilk probe ?tarih= query param'ının işe
yaramadığını gösterdi) — filtre alanlarını doldurup "Ara"ya basarak/tarih
seçerek tetiklenen ağ isteklerini (JSON API olabilir) ve sonuç tablosunun
tam satır sayısını/aralığını yakalıyor."""
from playwright.sync_api import sync_playwright

print("=" * 20, "ÇTB: tarih aralığı filtresi deneniyor", "=" * 20)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    xhr_hits = []

    def on_request(req):
        if req.resource_type in ("xhr", "fetch"):
            xhr_hits.append(("REQ", req.method, req.url, req.post_data))

    def on_response(resp):
        ctype = resp.headers.get("content-type", "")
        if "json" in ctype:
            try:
                body = resp.text()
            except Exception:
                body = "<okunamadı>"
            xhr_hits.append(("RES", resp.status, resp.url, body[:1000]))

    page.on("request", on_request)
    page.on("response", on_response)
    page.goto("https://www.corumtb.org.tr/Bulten", wait_until="networkidle", timeout=45000)
    page.wait_for_timeout(1000)

    # Varsayılan sayfada table[0]'ın toplam satır sayısı / tarih aralığı nedir?
    row_count = page.locator("table").first.locator("tbody tr").count()
    dates = page.locator("table").first.locator("tbody tr td:first-child strong").all_inner_texts()
    print(f"Varsayılan yükte table[0] satır sayısı: {row_count}, tarihler: {dates}")

    try:
        page.fill("#filterBaslangic", "2026-01-01")
        page.fill("#filterBitis", "2026-10-20")
        print("Tarih inputları dolduruldu, 'Ara' butonu aranıyor...")
        ara_btn = page.get_by_text("Ara", exact=True)
        print("Ara buton sayısı:", ara_btn.count())
        ara_btn.first.click()
        page.wait_for_timeout(2500)
    except Exception as exc:
        print("Form doldurma/tıklama hatası:", exc)

    print(f"Yakalanan XHR/fetch olay sayısı: {len(xhr_hits)}")
    for item in xhr_hits[:15]:
        print(" ", item)

    row_count_after = page.locator("table").first.locator("tbody tr").count()
    dates_after = page.locator("table").first.locator("tbody tr td:first-child strong").all_inner_texts()
    print(f"Filtre sonrası table[0] satır sayısı: {row_count_after}, tarihler (ilk 20): {dates_after[:20]}")
    print(f"Toplam tarih sayısı: {len(dates_after)}")

    body_text_after = page.inner_text("body")
    print("Filtre sonrası body metni (ilk 800 char):\n", body_text_after[:800])

    browser.close()

print("\n" + "=" * 20 + " PTB: tarih seçici deneniyor " + "=" * 20)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    xhr_hits = []

    def on_request(req):
        if req.resource_type in ("xhr", "fetch"):
            xhr_hits.append(("REQ", req.method, req.url, req.post_data))

    def on_response(resp):
        ctype = resp.headers.get("content-type", "")
        if "json" in ctype:
            try:
                body = resp.text()
            except Exception:
                body = "<okunamadı>"
            xhr_hits.append(("RES", resp.status, resp.url, body[:1000]))

    page.on("request", on_request)
    page.on("response", on_response)
    page.goto("https://bulten.polatliborsa.org.tr/gunluk-bulten.html", wait_until="networkidle", timeout=45000)
    page.wait_for_timeout(1000)

    try:
        date_input = page.locator("#gunlukDate")
        print("gunlukDate mevcut değer:", date_input.input_value())
        date_input.click()
        date_input.fill("20.10.2025")
        date_input.press("Enter")
        page.wait_for_timeout(2500)
    except Exception as exc:
        print("Tarih seçici hatası:", exc)

    print(f"Yakalanan XHR/fetch olay sayısı: {len(xhr_hits)}")
    for item in xhr_hits[:15]:
        print(" ", item)

    body_text_after = page.inner_text("body")
    print("Tarih seçimi sonrası body metni (ilk 800 char):\n", body_text_after[:800])

    browser.close()

print("\n" + "=" * 20 + " PTB: olası arşiv/haftalık bülten linkleri " + "=" * 20)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("https://bulten.polatliborsa.org.tr/", wait_until="networkidle", timeout=45000)
    page.wait_for_timeout(1000)
    links = page.locator("a").evaluate_all("els => els.map(e => ({href: e.href, text: e.innerText.trim()})).filter(x => x.text)")
    for l in links[:40]:
        print(" ", l)
    browser.close()
