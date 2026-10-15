import json
import urllib.request

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)", "X-Api-Key": "DEMO_KEY"}

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read())

commodities = get("https://api.fas.usda.gov/api/esr/commodities")
print("total commodities:", len(commodities))
for c in commodities:
    print(c)

print()
releases = get("https://api.fas.usda.gov/api/esr/datareleasedates")
print("release dates sample:", releases[:5], "... total:", len(releases))
# en guncel birkaç tanesini bul (tarihe göre sırala)
try:
    releases_sorted = sorted(releases, key=lambda r: r.get("weekEndingDate") or r.get("releaseDate") or "", reverse=True)
    print("most recent 5:", releases_sorted[:5])
except Exception as e:
    print("sort error", e)

print()
# Corn = 401, marketYear deneme: 2025 ve 2026
for my in (2025, 2026):
    url = f"https://api.fas.usda.gov/api/esr/exports/commodityCode/401/allCountries/marketYear/{my}"
    data = get(url)
    print(f"corn marketYear={my}: {len(data)} records")
    if data:
        print("sample record:", json.dumps(data[0], indent=2))
        print("sample record (last):", json.dumps(data[-1], indent=2))
