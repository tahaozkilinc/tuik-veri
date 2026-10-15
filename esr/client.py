"""USDA FAS Export Sales Reporting (ESR) REST API istemcisi.

Kaynak: api.fas.usda.gov/api/esr/*, Swagger spesifikasyonu
apps.fas.usda.gov/opendatawebV2/assets/swagger/swagger.json adresinde.
Kayıt/login gerekmiyor — paylaşılan `DEMO_KEY` (api.data.gov'un API
Umbrella altyapısıyla aynı) bu ölçekte (haftada bir, birkaç emtia) sorunsuz
çalışıyor. Kendi API key'inizi `ESR_API_KEY` ortam değişkeniyle
verebilirsiniz (daha yüksek rate limit için), vermezseniz DEMO_KEY kullanılır.
"""

from __future__ import annotations

import json
import os
import urllib.request

BASE_URL = "https://api.fas.usda.gov/api/esr"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; tuik-veri-research/1.0)",
    "Accept": "application/json",
}


def _api_key() -> str:
    return os.environ.get("ESR_API_KEY", "DEMO_KEY")


def _get(path: str) -> list | dict:
    req = urllib.request.Request(
        BASE_URL + path,
        headers={**HEADERS, "X-Api-Key": _api_key()},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def get_commodities() -> list[dict]:
    """[{commodityCode, commodityName, unitId}, ...]"""
    return _get("/commodities")


def get_countries() -> list[dict]:
    """[{countryCode, countryName, countryDescription, regionId, gencCode}, ...]"""
    return _get("/countries")


def get_units() -> list[dict]:
    """[{unitId, unitNames}, ...]"""
    return _get("/unitsOfMeasure")


def get_release_dates() -> list[dict]:
    """Her emtia için güncel pazarlama yılı ve en son yayın zaman damgası:
    [{commodityCode, marketYearStart, marketYearEnd, marketYear, releaseTimeStamp}, ...]
    """
    return _get("/datareleasedates")


def get_exports(commodity_code: int, market_year: int) -> list[dict]:
    """Bir emtianın bir pazarlama yılındaki TÜM ülkelere, TÜM haftalara ait
    satırlarını döndürür (artımlı değil — API her çağrıda o pazarlama
    yılının güncel/revize edilmiş tam geçmişini verir)."""
    return _get(f"/exports/commodityCode/{commodity_code}/allCountries/marketYear/{market_year}")
