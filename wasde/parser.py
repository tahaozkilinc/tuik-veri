"""WASDE (USDA World Agricultural Supply and Demand Estimates) TXT sürümünü
indirip Mısır / Soya Fasulyesi / Soya Küspesi (+ Soya Yağı) bilanço
tablolarını ayrıştırır.

Kaynak: usda.library.cornell.edu, publication id 3t945q76s (WASDE). Sayfa
her ayki yayını txt/pdf/xls/xml indirme linkleriyle listeliyor; TXT sürümü
temiz, sabit genişlikli düz metin (OCR değil) — PDF tablo çıkarmaktan çok
daha güvenilir.

Çıkardığı tablolar:
  - U.S. Feed Grain and Corn Supply and Use  -> CORN alt-tablosu
  - U.S. Soybeans and Products Supply and Use -> SOYBEANS / SOYBEAN OIL / SOYBEAN MEAL
  - World Corn Supply and Use (+ Contd. sayfası)
  - World Soybean Supply and Use
  - World Soybean Meal Supply and Use

WASDE'de TÜİK'teki "Mısır Özü" (nişasta/gluten) ve "Çekirdek" GTİP'lerine
karşılık gelen bir bilanço tablosu YOK — WASDE sadece Corn / Soybean /
Soybean Meal + Soybean Oil için üretim-arz-talep bilançosu yayınlıyor.
"""

from __future__ import annotations

import re
import urllib.request

PUB_URL = "https://usda.library.cornell.edu/concern/publications/3t945q76s?locale=en"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)"}

NUM = r"-?[\d,]+\.?\d*"
NUM_DEC = r"-?[\d,]+\.\d+"

US_ROW_RE = re.compile(
    rf"^\s*(?P<label>[^\d\s][^\n]*?)\s{{2,}}(?P<v1>{NUM})\s+(?P<v2>{NUM})\s+(?P<v3>{NUM})\s+(?P<v4>{NUM})\s*$",
    re.M,
)

REGIONS = [
    ("world", "World", "World"),
    ("world_less_china", "  World Less China", "  World Less China"),
    ("united_states", "United States", "United States"),
    ("total_foreign", "Total Foreign", "Total Foreign"),
    ("china", r"\s*China", r"\s*China"),
]

RELEASE_HEADER_RE = re.compile(r"WASDE\s*-\s*(\d+)\s*-\s*\d+\s+(\w+)\s+(\d{4})")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def find_latest_release() -> tuple[str, str]:
    """(release_date_iso, txt_url) döndürür — yayın listesi en yeniden eskiye
    sıralı olduğu için ilk eşleşen satır en son yayın."""
    html = fetch(PUB_URL)
    row_re = re.compile(r'<time datetime="([^"]+)">.*?</time>.*?href="([^"]+\.txt)"', re.S)
    m = row_re.search(html)
    if not m:
        raise RuntimeError("WASDE yayın sayfasında tarih+txt linki eşleşmesi bulunamadı")
    release_datetime, txt_url = m.group(1), m.group(2)
    if txt_url.startswith("/"):
        txt_url = "https://usda.library.cornell.edu" + txt_url
    return release_datetime[:10], txt_url


def extract_release_number(text: str) -> int:
    m = RELEASE_HEADER_RE.search(text)
    if not m:
        raise RuntimeError("WASDE metninde 'WASDE - <no> - <sayfa>' başlığı bulunamadı")
    return int(m.group(1))


def to_num(s: str) -> float:
    return float(s.replace(",", ""))


def find_block(text: str, title: str) -> tuple[int, int]:
    ti = text.find(title)
    if ti < 0:
        raise ValueError(f"tablo başlığı bulunamadı: {title!r}")
    sep = "=" * 80
    rule1 = text.find(sep, ti)
    rule2 = text.find(sep, rule1 + 1)
    rule3 = text.find(sep, rule2 + 1)
    return ti, rule3


def parse_us_block(block: str) -> dict[str, list[float]]:
    rows: dict[str, list[float]] = {}
    for m in US_ROW_RE.finditer(block):
        label = m.group("label").strip()
        if not label or label.lower().startswith("item"):
            continue
        rows[label] = [to_num(m.group(f"v{i}")) for i in range(1, 5)]
    return rows


def parse_us_corn(text: str) -> dict[str, list[float]]:
    ti, end = find_block(text, "U.S. Feed Grain and Corn Supply and Use")
    block = text[ti:end]
    corn_start = block.find("\nCORN\n")
    return parse_us_block(block[corn_start:])


def parse_us_soy(text: str) -> dict[str, dict[str, list[float]]]:
    ti, end = find_block(text, "U.S. Soybeans and Products Supply and Use")
    block = text[ti:end]
    out: dict[str, dict[str, list[float]]] = {}
    subs = ["SOYBEANS", "SOYBEAN OIL", "SOYBEAN MEAL"]
    for sub in subs:
        si = block.find(f"\n{sub}\n")
        nexti = len(block)
        for other in subs:
            if other == sub:
                continue
            oi = block.find(f"\n{other}\n", si + 1)
            if oi > si:
                nexti = min(nexti, oi)
        out[sub] = parse_us_block(block[si:nexti])
    return out


def _region_flat_re(label: str, ncols: int) -> re.Pattern:
    nums = r"\s+".join(f"(?P<v{i}>{NUM_DEC})" for i in range(1, ncols + 1))
    return re.compile(rf"^{label}\s*\d*/?\s+{nums}\s*$", re.M)


def _region_proj_re(label: str, ncols: int) -> re.Pattern:
    nums_aug = r"\s+".join(f"(?P<a{i}>{NUM_DEC})" for i in range(1, ncols + 1))
    nums_sep = r"\s+".join(f"(?P<s{i}>{NUM_DEC})" for i in range(1, ncols + 1))
    return re.compile(rf"^{label}\s*\d*/?\s*\n\s+Aug\s+{nums_aug}\s*\n\s+Sep\s+{nums_sep}\s*$", re.M)


def _split_years(block: str) -> tuple[str, str, str]:
    i2425 = block.find("\n                                    2024/25\n")
    iest = block.find("2025/26 Est.")
    iproj = block.find("2026/27 Proj.")
    return block[i2425:iest], block[iest:iproj], block[iproj:]


def parse_world_table(block: str, ncols: int) -> dict[str, dict[str, list[float]]]:
    sec_2425, sec_est, sec_proj = _split_years(block)
    out: dict[str, dict[str, list[float]]] = {}
    for region_key, lab_flat, lab_proj in REGIONS:
        series: dict[str, list[float]] = {}
        m = _region_flat_re(lab_flat, ncols).search(sec_2425)
        if m:
            series["2024/25"] = [to_num(m.group(f"v{i}")) for i in range(1, ncols + 1)]
        m = _region_flat_re(lab_flat, ncols).search(sec_est)
        if m:
            series["2025/26 Est."] = [to_num(m.group(f"v{i}")) for i in range(1, ncols + 1)]
        m = _region_proj_re(lab_proj, ncols).search(sec_proj)
        if m:
            series["2026/27 Proj. Aug"] = [to_num(m.group(f"a{i}")) for i in range(1, ncols + 1)]
            series["2026/27 Proj. Sep"] = [to_num(m.group(f"s{i}")) for i in range(1, ncols + 1)]
        out[region_key] = series
    return out


def parse_world_corn(text: str) -> dict[str, dict[str, list[float]]]:
    ti, _ = find_block(text, "World Corn Supply and Use")
    _, end2 = find_block(text, "World Corn Supply and Use  1/  (Contd.)")
    return parse_world_table(text[ti:end2], ncols=7)


def parse_world_soy(text: str) -> dict[str, dict[str, list[float]]]:
    ti, end = find_block(text, "World Soybean Supply and Use")
    return parse_world_table(text[ti:end], ncols=7)


def parse_world_soymeal(text: str) -> dict[str, dict[str, list[float]]]:
    ti, end = find_block(text, "World Soybean Meal Supply and Use")
    return parse_world_table(text[ti:end], ncols=6)
