#!/usr/bin/env python3
"""Refresh configured starter labels. Browser lookups are not limited to this list."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
FIELDS = 'code,product_name,product_name_en,brands,quantity,serving_size,nutrition_data_per,nutriments,ingredients_text,ingredients_text_en,allergens_tags,traces_tags,countries_tags,image_front_small_url,last_modified_t,product_quantity_unit,serving_quantity_unit'
USER_AGENT = 'CoolCode-LabelCompare/1.0 (https://coolcode.ca/labelcompare/; jeffdyer@gmail.com)'


def validate_config(config):
    codes = config.get('exampleBarcodes')
    if not isinstance(codes, list) or any(not isinstance(c, str) or not c.isascii() or not c.isdigit() or not 8 <= len(c) <= 14 for c in codes):
        raise ValueError('exampleBarcodes must be an array of 8–14 digit strings')
    identities = [c.lstrip('0') for c in codes]
    if len(set(identities)) != len(identities):
        raise ValueError('exampleBarcodes must be unique, including leading-zero aliases')
    if len(codes) > 100:
        raise ValueError('For more than 100 saved examples use the provider bulk download; this collector is for a small starter shelf')
    maximum = config.get('maxProducts')
    if isinstance(maximum, bool) or not isinstance(maximum, int) or not 2 <= maximum <= 24:
        raise ValueError('maxProducts must be 2–24')
    initial = config.get('initialBarcodes')
    if not isinstance(initial, list) or len(initial) > maximum or any(c not in codes for c in initial):
        raise ValueError('initialBarcodes must fit maxProducts and belong to exampleBarcodes')
    if len(set(initial)) != len(initial):
        raise ValueError('initialBarcodes must be unique')
    if not isinstance(config.get('requestIntervalMs'), int) or config['requestIntervalMs'] < 4200:
        raise ValueError('requestIntervalMs must be at least 4200')
    budget = config.get('requestsPerMinute')
    if isinstance(budget, bool) or not isinstance(budget, int) or not 1 <= budget <= 12:
        raise ValueError('requestsPerMinute must be 1–12')
    return codes


def fetch(code):
    url = 'https://world.openfoodfacts.org/api/v3/product/' + code + '?' + urlencode({'fields': FIELDS, 'lc': 'en', 'cc': 'ca'})
    with urlopen(Request(url, headers={'User-Agent': USER_AGENT}), timeout=45) as response:
        payload = response.read(2000001)
    if len(payload) > 2000000:
        raise ValueError('Product response exceeds 2 MB')
    data = json.loads(payload)
    product = data.get('product', {})
    actual = str(product.get('code', data.get('code', '')))
    if data.get('status') not in ('success', 'success_with_warnings', 'success_with_errors', 1) or actual.lstrip('0') != code.lstrip('0'):
        raise ValueError(f'Product {code} was not found or has a different barcode')
    return {'raw': data, 'sourceUrl': url, 'sha256': hashlib.sha256(payload).hexdigest(),
            'capturedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}


def refresh(root=ROOT, fetcher=fetch, sleeper=time.sleep):
    config = json.loads((root / 'web/config.json').read_text())
    codes = validate_config(config)
    records = []
    for i, code in enumerate(codes):
        if i:
            sleeper(max(config['requestIntervalMs'] / 1000, 60 / config['requestsPerMinute']))
        records.append(fetcher(code))
    data = {'schemaVersion': 1, 'tool': 'labelcompare',
            'capturedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'attribution': 'Open Food Facts contributors',
            'dataLicense': 'https://opendatacommons.org/licenses/odbl/1-0/',
            'records': records}
    path = root / 'web/data/examples.json'
    path.parent.mkdir(exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)
    print(f'Refreshed {len(records)} configured saved labels')


if __name__ == '__main__':
    refresh()
