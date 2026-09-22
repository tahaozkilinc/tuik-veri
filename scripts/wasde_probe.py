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

    # data-release-date + href + dosya türü (btn içindeki div metni) taşıyan
    # <a class="... file_download" ...> etiketlerini bul.
    link_re = re.compile(
        r'<a[^>]*class="[^"]*file_download[^"]*"[^>]*href="([^"]+)"[^>]*data-release-date="([^"]+)"[^>]*>(.*?)</a>',
        re.S,
    )
    matches = link_re.findall(html)
    print(f"regex (href first) match count: {len(matches)}", file=sys.stderr)

    if not matches:
        # attribute order might differ; try href-agnostic pass
        link_re2 = re.compile(
            r'<a[^>]*class="[^"]*file_download[^"]*"([^>]*)>(.*?)</a>', re.S
        )
        alt = link_re2.findall(html)
        print(f"alt match count: {len(alt)}", file=sys.stderr)
        for attrs, inner in alt[:10]:
            href_m = re.search(r'href="([^"]+)"', attrs)
            date_m = re.search(r'data-release-date="([^"]+)"', attrs)
            print("---")
            print("href:", href_m.group(1) if href_m else None)
            print("date:", date_m.group(1) if date_m else None)
            print("inner:", re.sub(r"\s+", " ", inner).strip()[:120])
        # dump a slice of raw html around first "file_download" occurrence for inspection
        idx = html.find("file_download")
        print("\n--- raw html slice around first file_download ---", file=sys.stderr)
        print(html[max(0, idx - 300) : idx + 1200], file=sys.stderr)
        return

    for href, date, inner in matches[:15]:
        label = re.sub(r"\s+", " ", inner).strip()
        print(f"{date}  {label!r:30s}  {href}")

    # try downloading the first (most recent) txt file
    txt_links = [h for h, d, i in matches if h.lower().endswith(".txt")]
    if txt_links:
        txt_url = txt_links[0]
        if txt_url.startswith("/"):
            txt_url = "https://usda.library.cornell.edu" + txt_url
        print(f"\nDownloading latest TXT: {txt_url}", file=sys.stderr)
        txt_content = fetch(txt_url)
        print(f"txt length: {len(txt_content)}", file=sys.stderr)
        print("\n=== FIRST 4000 CHARS OF TXT ===")
        print(txt_content[:4000])
        print("\n=== SEARCHING FOR 'CORN' AND 'SOYBEAN' SECTIONS ===")
        for kw in ["CORN", "SOYBEAN", "Soybean Meal", "WORLD CORN", "WORLD SOYBEAN"]:
            idx = txt_content.upper().find(kw.upper())
            print(f"{kw}: found at index {idx}" if idx >= 0 else f"{kw}: NOT FOUND")
    else:
        print("\nNo .txt link found among matches.", file=sys.stderr)


if __name__ == "__main__":
    main()
