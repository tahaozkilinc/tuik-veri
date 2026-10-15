import json
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)", "X-Api-Key": "DEMO_KEY"}

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read())

units = get("https://api.fas.usda.gov/api/esr/unitsOfMeasure")
print("units:", units)

countries = get("https://api.fas.usda.gov/api/esr/countries")
print("total countries:", len(countries))
# Turkey ve büyük alıcıları bul
for c in countries:
    name = str(c.get("countryName", "")).upper()
    if any(k in name for k in ["TURKEY", "TURKIYE", "MEXICO", "CHINA", "JAPAN", "UNKNOWN", "EUROPEAN UNION", "WORLD"]):
        print(c)
print("sample first 5:", countries[:5])
print("country 9990:", [c for c in countries if c.get("countryCode") == 9990])
print("country 1220:", [c for c in countries if c.get("countryCode") == 1220])

releases = get("https://api.fas.usda.gov/api/esr/datareleasedates")
for r in releases:
    if r["commodityCode"] in (401, 801, 901, 902, 1110):
        print("release:", r)
