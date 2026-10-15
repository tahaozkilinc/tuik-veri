"""temp: KTB (Konya Ticaret Borsasi) kesif scripti."""
import urllib.request

url = "https://www.ktb.org.tr/gunlukfiyat"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=20) as resp:
    html = resp.read().decode("utf-8", errors="replace")

print("LEN:", len(html))
print("---- first 3000 chars ----")
print(html[:3000])
print("---- script tags ----")
import re
for m in re.finditer(r'<script[^>]*src="([^"]+)"', html):
    print("SCRIPT SRC:", m.group(1))
print("---- inline script snippets mentioning ajax/api/json ----")
for m in re.finditer(r'[^\n]{0,80}(ajax|\.php|\.asp|/api/|json)[^\n]{0,120}', html, re.IGNORECASE):
    print(m.group(0))
