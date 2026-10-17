"""TCMB (Türkiye Cumhuriyet Merkez Bankası) günlük döviz kuru XML formatını araştırır."""
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (research probe)"}

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")

urls = [
    "https://www.tcmb.gov.tr/kurlar/today.xml",
    "https://www.tcmb.gov.tr/kurlar/202401/15012024.xml",
    "https://www.tcmb.gov.tr/kurlar/202410/17102025.xml",
]

for u in urls:
    print("=" * 80)
    print("URL:", u)
    try:
        status, body = fetch(u)
        print("status:", status)
        print(body[:3000])
    except Exception as e:
        print("ERROR:", repr(e))

# Test a weekend date (likely no file / redirect behavior)
print("=" * 80)
print("Weekend test (Saturday 2025-10-11):")
try:
    status, body = fetch("https://www.tcmb.gov.tr/kurlar/202510/11102025.xml")
    print("status:", status)
    print(body[:1500])
except Exception as e:
    print("ERROR:", repr(e))
