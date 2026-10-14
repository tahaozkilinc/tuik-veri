"""Geçici teşhis scripti #3 — parse_world_corn() ile BİREBİR aynı slice'ı
kullanarak (ti'den find_block'un kendi rule3'ü değil, Contd. sayfasının
sonu olan end2'ye kadar) gerçek 2026/27 Proj. bölümünü bulmaya çalışır."""
from wasde import parser

report_date, txt_url = parser.find_latest_release()
print("release:", report_date, txt_url)
text = parser.fetch(txt_url)

ti, _ = parser.find_block(text, "World Corn Supply and Use")
_, end2 = parser.find_block(text, "World Corn Supply and Use  1/  (Contd.)")
block = text[ti:end2]
print("full block length:", len(block))

iproj = block.find("2026/27 Proj.")
print("iproj index:", iproj)
if iproj >= 0:
    print("\n--- Proj. section, 1500 chars ---")
    print(block[iproj:iproj+1500])
else:
    print("literal '2026/27 Proj.' not found in full block either")
    # 2025/26 Est. nerede bitiyor, ne geliyor sonra?
    iest = block.find("2025/26 Est.")
    print("\n--- after 2025/26 Est. marker, next 3000 chars ---")
    print(block[iest:iest+3000])
