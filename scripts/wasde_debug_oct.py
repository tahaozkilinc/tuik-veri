"""Geçici teşhis scripti #2 — Dünya Mısır tablosunun ham başlık/satır
yapısını doğrudan dump eder (önceki script, "2026/27 Proj." string'i
bulunamayınca sessizce boş slice döndürmüştü)."""
from wasde import parser

report_date, txt_url = parser.find_latest_release()
print("release:", report_date, txt_url)
text = parser.fetch(txt_url)

ti, end2 = parser.find_block(text, "World Corn Supply and Use")
block = text[ti:end2]
print("block length:", len(block))
print("\n--- World Corn block, first 2200 chars ---")
print(block[:2200])

print("\ncontains literal '2026/27 Proj.':", "2026/27 Proj." in block)
print("contains literal '2025/26 Est.':", "2025/26 Est." in block)
print("contains literal '2024/25':", "2024/25" in block)

# hangi biçimde "2026/27" geçiyor gerçekten?
import re
for m in re.finditer(r"2026/27[^\n]{0,40}", block):
    print("match:", repr(m.group(0)))
