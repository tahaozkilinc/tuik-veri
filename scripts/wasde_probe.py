"""WASDE (USDA World Agricultural Supply and Demand Estimates) kaynağını
keşif amaçlı çeker — Supabase'e hiçbir şey yazmaz.

Kaynak: usda.library.cornell.edu üzerindeki "concern/publications/{id}"
sayfası, WASDE için id = 3t945q76s. Bu sayfa her ayki yayını txt/pdf/xls
indirme linkleriyle listeliyor, kimlik doğrulama gerekmiyor (API token'lı
resmi API'nin aksine — bkz. https://github.com/drewdiprinzio/usda-esmis-parsing).

Amaç: en son yayının indirme linklerini bulmak, TXT sürümünü indirip
biçimini incelemek (WASDE PDF yerine düz metin olarak yayınlıyor —
ayrıştırması PDF tablo çıkarmaktan çok daha güvenilir).
"""

from __future__ import annotations

import re
import sys
import urllib.request

PUB_URL = "https://usda.library.cornell.edu/concern/publications/3t945q76s?locale=en"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main() -> None:
    print(f"GET {PUB_URL}", file=sys.stderr)
    html = fetch(PUB_URL)
    print(f"html length: {len(html)}", file=sys.stderr)

    with open("wasde_page.html", "w", encoding="utf-8") as f:
        f.write(html)

    # any <a> tags whose href ends in a file extension we care about
    href_re = re.compile(r'<a[^>]*href="([^"]+\.(?:pdf|txt|xls|xlsx|zip))"[^>]*>(.*?)</a>', re.I | re.S)
    matches = href_re.findall(html)
    print(f"\n\nfile-extension href match count: {len(matches)}")
    for href, inner in matches[:20]:
        print(href, "|", re.sub(r"\s+", " ", inner).strip()[:80])

    if not matches:
        return

    # try downloading the first (most recent) txt file
    txt_links = [h for h, i in matches if h.lower().endswith(".txt")]
    if txt_links:
        txt_url = txt_links[0]
        if txt_url.startswith("/"):
            txt_url = "https://usda.library.cornell.edu" + txt_url
        print(f"\nDownloading latest TXT: {txt_url}", file=sys.stderr)
        txt_content = fetch(txt_url)
        print(f"txt length: {len(txt_content)}", file=sys.stderr)

        with open("wasde_latest.txt", "w", encoding="utf-8") as f:
            f.write(txt_content)
        print(f"\nfull txt saved, total length {len(txt_content)}")

        # GitHub Actions artifact indirme egress'ten engellendiği için (sadece
        # usda.gov değil, Azure blob depolama da bloklu) — tüm dosyayı iş
        # kaydına (job log) düz metin olarak yazdır, buradan tail_lines ile
        # tamamını okuyacağız.
        print("\n=== FULL TXT START ===")
        print(txt_content)
        print("=== FULL TXT END ===")
    else:
        print("\nNo .txt link found among matches.", file=sys.stderr)


if __name__ == "__main__":
    main()
