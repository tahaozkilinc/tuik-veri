"""Geçici kontrol: GH Actions runner'ından (gerçek internet erişimi var)
canlı GitHub Pages dashboard'unu Playwright ile açıp TÜRİB sekmesinde
gerçek konsol hatası / banner durumu var mı kontrol ediyoruz. Kullanıcı
'TÜRİB'te hala sıkıntı var' diyor ama Supabase verisi ve scrape_runs
tertemiz çıktı — bu yüzden canlı sayfayı gerçek tarayıcıda açıp bakmak
gerekiyor (sandbox'tan github.io'ya doğrudan erişim yok)."""

import sys
from playwright.sync_api import sync_playwright

URL = "https://tahaozkilinc.github.io/tuik-veri/"


def main() -> int:
    console_msgs = []
    page_errors = []
    failed_requests = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("console", lambda m: console_msgs.append((m.type, m.text)))
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("requestfailed", lambda r: failed_requests.append((r.url, str(r.failure))))

        page.goto(URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1500)

        turib_reqs = []
        page.on("request", lambda r: turib_reqs.append((r.url, r.headers.get("range"))) if "turib_bulletin" in r.url else None)
        turib_resps = []
        page.on("response", lambda r: turib_resps.append((r.url, r.status, r.headers.get("content-range"))) if "turib_bulletin" in r.url else None)

        t0 = page.evaluate("Date.now()")
        page.click("#tab-exchange")
        page.wait_for_timeout(500)
        page.click("#subtab-turib")
        page.wait_for_timeout(1000)
        print(f"1s sonra: istek sayısı={len(turib_reqs)}, yanıt sayısı={len(turib_resps)}")
        page.wait_for_timeout(2000)
        print(f"3s sonra: istek sayısı={len(turib_reqs)}, yanıt sayısı={len(turib_resps)}")
        page.wait_for_timeout(5000)
        print(f"8s sonra: istek sayısı={len(turib_reqs)}, yanıt sayısı={len(turib_resps)}")
        page.wait_for_timeout(7000)
        t1 = page.evaluate("Date.now()")
        print(f"15s sonra: istek sayısı={len(turib_reqs)}, yanıt sayısı={len(turib_resps)} (gerçek geçen süre: {t1 - t0}ms)")
        for u, rng in turib_reqs:
            print(f"  İSTEK range={rng}  {u[:70]}")
        for u, status, crange in turib_resps:
            print(f"  YANIT status={status} content-range={crange}  {u[:70]}")

        page.wait_for_timeout(500)
        banner = page.locator("#turib-banner-text").inner_text() if page.locator("#turib-banner-text").count() else "(banner yok)"
        asof = page.locator("#turib-asof-badge").inner_text() if page.locator("#turib-asof-badge").count() else "(asof yok)"
        table_rows = page.locator("#turib-tbody tr").count() if page.locator("#turib-tbody").count() else -1
        date_end = page.eval_on_selector("#turib-date-end", "el => el.value") if page.locator("#turib-date-end").count() else "(yok)"
        date_start = page.eval_on_selector("#turib-date-start", "el => el.value") if page.locator("#turib-date-start").count() else "(yok)"
        error_text = page.locator("text=Veri çekilemedi").count()

        print(f"banner: {banner}")
        print(f"asof: {asof}")
        print(f"date_start: {date_start}  date_end: {date_end}")
        print(f"tbody satır sayısı: {table_rows}")
        print(f"'Veri çekilemedi' görünüyor mu: {error_text > 0}")

        print(f"\nkonsol mesajları ({len(console_msgs)}):")
        for t, msg in console_msgs:
            print(f"  [{t}] {msg}")

        print(f"\npage error'lar ({len(page_errors)}):")
        for e in page_errors:
            print(f"  {e}")

        print(f"\nbaşarısız istekler ({len(failed_requests)}):")
        for u, f in failed_requests:
            print(f"  {u} -> {f}")

        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
