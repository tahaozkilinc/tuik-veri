"""Geçici kontrol: Supabase/PostgREST'in content-range header'ını CORS
Access-Control-Expose-Headers ile tarayıcı JS'ine açıp açmadığını gerçek
tarayıcıdan (Playwright) kontrol ediyoruz. fetchAllPagesParallel
değişikliği bu header'a bağımlı — eğer expose edilmiyorsa değişiklik
regresyona yol açar (sadece ilk 1000 satır gelir, sessizce)."""

import json
from playwright.sync_api import sync_playwright

SUPABASE_URL = "https://kajilskrmavwqdaipixu.supabase.co"
ANON_KEY_PATH = "dashboard/config.js"


def get_anon_key() -> str:
    with open(ANON_KEY_PATH) as f:
        content = f.read()
    import re
    m = re.search(r'SUPABASE_ANON_KEY:\s*"([^"]+)"', content)
    return m.group(1)


def main() -> None:
    anon_key = get_anon_key()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # file:// origin — tıpkı GitHub Pages'in kendisi gibi supabase.co'ya
        # cross-origin istek yapıyor.
        page.goto("about:blank")
        result = page.evaluate(
            """
            async ({url, key}) => {
                const res = await fetch(url + "/rest/v1/turib_bulletin?select=trade_date&order=trade_date.asc", {
                    headers: {
                        apikey: key,
                        Authorization: "Bearer " + key,
                        Range: "0-9",
                        Prefer: "count=exact",
                    },
                });
                const headerEntries = [];
                for (const [k, v] of res.headers.entries()) headerEntries.push(k + ": " + v);
                return {
                    status: res.status,
                    contentRange: res.headers.get("content-range"),
                    allHeaders: headerEntries,
                    bodyLen: (await res.text()).length,
                };
            }
            """,
            {"url": SUPABASE_URL, "key": anon_key},
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        browser.close()


if __name__ == "__main__":
    main()
