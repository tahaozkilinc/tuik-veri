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
        text = resp.read().decode("utf-8", errors="replace")
    # WASDE TXT dosyaları Windows tarzı \r\n satır sonu kullanıyor; aşağıdaki
    # tablo sınırlama mantığı ("\nCORN\n" gibi) çıplak \n arıyor ve \r\n ile
    # hiç eşleşmiyor (bu da parse_us_corn/parse_us_soy'un sessizce 0 satır
    # döndürmesine yol açıyordu) — tek noktadan normalize ediyoruz.
    return text.replace("\r\n", "\n").replace("\r", "\n")


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


def _norm_label(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


# ABD tablolarının 4 sütunu her ay aynı KONUMDA ("iki yıl önce" / "bir
# önceki pazarlama yılı tahmini" / "bu pazarlama yılının bir önceki ay
# projeksiyonu" / "bu pazarlama yılının bu ay projeksiyonu") ama metindeki
# gerçek etiketler (yıl + ay kısaltması) her ay değişiyor — önceden "2024/25
# 2025/26 Est. 2026/27 Proj. Aug 2026/27 Proj. Sep" sabit yazıyordu, bu da
# her ay elle güncellenmesi gereken, güncellenmeyince de sessizce yanlış
# etiketler üreten bir kusurdu. Artık her tablonun kendi "Item" başlık
# satırından (yıllar + ay kısaltmaları) dinamik olarak okunuyor.
US_HEADER_RE = re.compile(
    r"\n[ \t]*(?P<y1>\d{4}/\d{2})[ \t]+(?P<y2>\d{4}/\d{2}[ \t]+Est\.)[ \t]+"
    r"(?P<y3>\d{4}/\d{2}[ \t]+Proj\.)[ \t]+(?P<y4>\d{4}/\d{2}[ \t]+Proj\.)[ \t]*\n"
    r"Item[ \t]+(?P<m3>[A-Za-z]+)[ \t]+(?P<m4>[A-Za-z]+)[ \t]*\n"
)


def detect_us_periods(block: str) -> list[str]:
    """Bir ABD tablosu bloğunun (ör. find_block(text, 'U.S. Feed Grain...')
    çıktısı) kendi 'Item ... <ay1> <ay2>' başlık satırından 4 dönem
    etiketini sırayla döndürür: [iki yıl önce, önceki yıl tahmini,
    bu yıl önceki ay projeksiyonu, bu yıl bu ay projeksiyonu]."""
    m = US_HEADER_RE.search(block)
    if not m:
        raise RuntimeError("WASDE ABD tablosunda 'Item' dönem başlığı bulunamadı")
    return [
        _norm_label(m.group("y1")),
        _norm_label(m.group("y2")),
        _norm_label(m.group("y3")) + " " + m.group("m3"),
        _norm_label(m.group("y4")) + " " + m.group("m4"),
    ]


def parse_us_corn(text: str) -> tuple[list[str], dict[str, list[float]]]:
    ti, end = find_block(text, "U.S. Feed Grain and Corn Supply and Use")
    block = text[ti:end]
    periods = detect_us_periods(block)
    corn_start = block.find("\nCORN\n")
    return periods, parse_us_block(block[corn_start:])


def parse_us_soy(text: str) -> tuple[list[str], dict[str, dict[str, list[float]]]]:
    ti, end = find_block(text, "U.S. Soybeans and Products Supply and Use")
    block = text[ti:end]
    periods = detect_us_periods(block)
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
    return periods, out


def _region_flat_re(label: str, ncols: int) -> re.Pattern:
    nums = r"\s+".join(f"(?P<v{i}>{NUM_DEC})" for i in range(1, ncols + 1))
    return re.compile(rf"^{label}\s*\d*/?\s+{nums}\s*$", re.M)


def _region_proj_re(label: str, ncols: int, month1: str, month2: str) -> re.Pattern:
    nums1 = r"\s+".join(f"(?P<a{i}>{NUM_DEC})" for i in range(1, ncols + 1))
    nums2 = r"\s+".join(f"(?P<s{i}>{NUM_DEC})" for i in range(1, ncols + 1))
    return re.compile(rf"^{label}\s*\d*/?\s*\n\s+{month1}\s+{nums1}\s*\n\s+{month2}\s+{nums2}\s*$", re.M)


# Dünya tabloları ABD tablosu gibi tek bir başlık satırında yıl listesi
# vermiyor — "2024/25", "2025/26 Est." ve "2026/27 Proj." her biri kendi
# bölümünün başında tek başına bir satır olarak duruyor. Yıl metinleri de
# (pazarlama yılı ilerledikçe) ay kısaltmaları gibi değişebileceği için
# bunlar da sabit string yerine düzenli ifadeyle bulunuyor.
FLAT_YEAR_RE = re.compile(r"^[ \t]+(\d{4}/\d{2})[ \t]*$", re.M)
EST_YEAR_RE = re.compile(r"^[ \t]*(\d{4}/\d{2}[ \t]+Est\.)[ \t]*$", re.M)
PROJ_YEAR_RE = re.compile(r"^[ \t]*(\d{4}/\d{2}[ \t]+Proj\.)[ \t]*$", re.M)


def _split_years(block: str) -> tuple[str, str, str, str, str, str]:
    m_flat = FLAT_YEAR_RE.search(block)
    m_est = EST_YEAR_RE.search(block)
    m_proj = PROJ_YEAR_RE.search(block)
    if not (m_flat and m_est and m_proj):
        raise RuntimeError("WASDE Dünya tablosunda yıl başlıkları (ör. '2025/26 Est.') bulunamadı")
    sec_flat = block[m_flat.start():m_est.start()]
    sec_est = block[m_est.start():m_proj.start()]
    sec_proj = block[m_proj.start():]
    return sec_flat, sec_est, sec_proj, _norm_label(m_flat.group(1)), _norm_label(m_est.group(1)), _norm_label(m_proj.group(1))


def _detect_proj_months(proj_section: str) -> tuple[str, str]:
    """Proj. bölümündeki ilk iki ardışık ay satırını (ör. 'Sep'/'Oct') bulur
    — hangi iki ay olduğu rapor ayına göre değişir, metinden okunur."""
    m = re.search(
        rf"\n[ \t]*([A-Za-z]+)[ \t]+{NUM_DEC}(?:[ \t]+{NUM_DEC})*[ \t]*"
        rf"\n[ \t]*([A-Za-z]+)[ \t]+{NUM_DEC}(?:[ \t]+{NUM_DEC})*",
        proj_section,
    )
    if not m:
        raise RuntimeError("WASDE Dünya tablosunda 'Proj.' ay kısaltmaları bulunamadı")
    return m.group(1), m.group(2)


def parse_world_table(block: str, ncols: int) -> tuple[dict[str, dict[str, list[float]]], dict[str, str]]:
    sec_flat, sec_est, sec_proj, label_flat, label_est, label_proj = _split_years(block)
    month1, month2 = _detect_proj_months(sec_proj)
    period_proj1, period_proj2 = f"{label_proj} {month1}", f"{label_proj} {month2}"
    period_slots = {"flat": label_flat, "est": label_est, "proj_prev": period_proj1, "proj_latest": period_proj2}
    out: dict[str, dict[str, list[float]]] = {}
    for region_key, lab_flat, lab_proj in REGIONS:
        series: dict[str, list[float]] = {}
        m = _region_flat_re(lab_flat, ncols).search(sec_flat)
        if m:
            series[label_flat] = [to_num(m.group(f"v{i}")) for i in range(1, ncols + 1)]
        m = _region_flat_re(lab_flat, ncols).search(sec_est)
        if m:
            series[label_est] = [to_num(m.group(f"v{i}")) for i in range(1, ncols + 1)]
        m = _region_proj_re(lab_proj, ncols, month1, month2).search(sec_proj)
        if m:
            series[period_proj1] = [to_num(m.group(f"a{i}")) for i in range(1, ncols + 1)]
            series[period_proj2] = [to_num(m.group(f"s{i}")) for i in range(1, ncols + 1)]
        out[region_key] = series
    return out, period_slots


def parse_world_corn(text: str) -> tuple[dict[str, dict[str, list[float]]], dict[str, str]]:
    ti, _ = find_block(text, "World Corn Supply and Use")
    _, end2 = find_block(text, "World Corn Supply and Use  1/  (Contd.)")
    return parse_world_table(text[ti:end2], ncols=7)


def parse_world_soy(text: str) -> tuple[dict[str, dict[str, list[float]]], dict[str, str]]:
    ti, end = find_block(text, "World Soybean Supply and Use")
    return parse_world_table(text[ti:end], ncols=7)


def parse_world_soymeal(text: str) -> tuple[dict[str, dict[str, list[float]]], dict[str, str]]:
    ti, end = find_block(text, "World Soybean Meal Supply and Use")
    return parse_world_table(text[ti:end], ncols=6)
