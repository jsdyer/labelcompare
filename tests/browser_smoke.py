"""Exercise real retained labels and arbitrary barcode lookup at a project subpath."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass


def main():
    screenshots=ROOT/'browser-checks';screenshots.mkdir(exist_ok=True)
    saved=json.loads((ROOT/'web/data/examples.json').read_text())
    config=json.loads((ROOT/'web/config.json').read_text())
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT/'dist',Path(temporary)/'labelcompare')
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=temporary))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch();page=browser.new_page(viewport={'width':1280,'height':1000})
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.route('**/assets/tool-metrics.js',lambda route:route.fulfill(status=200,body=''))
                page.goto(f'http://127.0.0.1:{server.server_port}/labelcompare/')
                page.locator('#status').filter(has_text='saved labels loaded').wait_for()
                expected=len(config['initialBarcodes'])
                assert page.locator('.product-card').count()==expected
                assert f'{expected} of {config["maxProducts"]}' in page.locator('#capacity').inner_text()
                page.locator('#basis').select_option('serving')
                assert 'Serving sizes differ' in page.locator('#basis-note').inner_text()
                page.locator('#basis').select_option('per100')
                if saved['records']:
                    page.locator('#clear').click()
                    assert page.locator('.product-card').count()==0
                    response=json.loads((ROOT/'tests/fixtures/milk.json').read_text())['raw']
                    page.route('https://world.openfoodfacts.org/api/v3/product/**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(response),headers={'Access-Control-Allow-Origin':'*'}))
                    page.locator('#barcode').fill('68700104060')
                    page.locator('#add-product').click()
                    page.locator('#status').filter(has_text='Source records can differ').wait_for()
                    assert page.locator('.product-card').count()==1
                    assert page.locator('.product-card .origin').inner_text().strip().casefold()=='live lookup'
                    assert page.locator('.product-card').get_attribute('data-barcode')==response['product']['code']
                    page.locator('#basis').select_option('serving')
                    assert page.locator('#nutrition-body tr').filter(has_text='Calcium (mg)').locator('td').inner_text()=='500'
                    assert page.locator('#nutrition-body tr').filter(has_text='Vitamin D (µg)').locator('td').inner_text()=='5'
                    page.locator('.label-details summary').click()
                    assert page.locator('.photo-links a').count()==3
                    assert 'Not reported' in page.locator('.label-details').inner_text()
                    with page.expect_download() as download:
                        page.locator('#export-json').click()
                    receipt=json.loads(Path(download.value.path()).read_text())
                    assert receipt['records'][0]['raw']['product']['code']==response['product']['code']
                    receipt['records'][0]['raw']['product']['product_name_en']='<img src=x onerror="alert(1)">'
                    page.locator('#import-json').set_input_files({'name':'receipt.json','mimeType':'application/json','buffer':json.dumps(receipt).encode()})
                    page.locator('#status').filter(has_text='opened locally').wait_for()
                    assert '<img src=x' in page.locator('.product-card h3').inner_text()
                    assert page.locator('img[src="x"]').count()==0
                    page.locator('#clear').click()
                    # Restore configured labels for meaningful screenshots.
                    for code in config['initialBarcodes']:
                        page.locator(f'[data-example="{code}"]').click()
                page.screenshot(path=str(screenshots/'desktop.png'),full_page=True)
                page.set_viewport_size({'width':390,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(screenshots/'mobile.png'),full_page=True)
                assert not errors,errors
                browser.close()
            print('Browser checks passed: expandable defaults, barcode lookup, serving basis, receipt download/import, safe source text, mobile layout')
        finally:server.shutdown()

if __name__=='__main__':main()
