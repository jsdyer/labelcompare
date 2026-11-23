# Label Compare

A public browser tool for comparing food labels by barcode. [Open Label Compare](https://coolcode.ca/labelcompare/).

<!-- coolcode:guide -->
Enter any food barcode to compare nutrition, ingredients and reported allergens. Switch between source-normalized 100 g/mL and each product’s own serving, then save a dated JSON receipt to reopen later; missing fields never become zero or an allergy-free claim.
<!-- /coolcode:guide -->

## Use it

The opening comparison contains real, dated Open Food Facts beverage records, including a Diet Pepsi record listing Canada. These are convenient starting points, not an allowlist. Enter an 8–14 digit barcode from your own package and choose **Find & add product**. Spaces and hyphens are accepted; UPC leading-zero aliases refer to the same product. Remove a label to free a comparison slot. **Look up current record** refreshes a selected label from the provider.

Switch the nutrition basis to compare the source’s normalized 100 g/mL values or its published serving values. Millilitres and grams stay distinct. When the record does not establish the basis, it is labelled unknown. Different serving sizes are explicitly identified. Values use the unprepared `nutriments` fields; there is no invented density, portion or prepared-food calculation. Sodium is converted from grams to milligrams. Empty allergen/trace fields mean no data was listed, not absence of allergens. Always check the actual package.

**Save receipt JSON** preserves the exact selected source responses and retrieval dates. **Open receipt** reads that file locally. **Export nutrition CSV** uses the selected basis and includes sources, dates and units. The tool keeps comparisons and a temporary lookup cache in memory only; reload starts with the configured defaults. Product names and other source text are rendered as text, not HTML.

## Expand or customize

Edit [`web/config.json`](web/config.json). The application and collector read this same file; no fixed product count is embedded in the UI, tests or validation.

```json
{
  "maxProducts": 6,
  "exampleBarcodes": ["069000019832", "04963406", "5000112519945", "3017620422003"],
  "initialBarcodes": ["069000019832", "04963406", "3017620422003"],
  "requestIntervalMs": 5000,
  "requestsPerMinute": 12
}
```

- `maxProducts`: number of simultaneous comparison slots, from 2–24. Four is the initial default, not a fixed data-coverage limit.
- `exampleBarcodes`: editable saved-label shortcuts. Any barcode outside this list still works in live lookup. The example collector is capped at 100 records because the provider asks larger consumers to use bulk downloads.
- `initialBarcodes`: labels to open by default; use a subset of `exampleBarcodes` within your comparison capacity.
- `requestIntervalMs`: minimum spacing between live requests; at least 4200 ms. Keep the default 5000 ms unless making it slower.
- `requestsPerMinute`: tab-local budget, no more than 12; the provider limit currently says 15 product reads/minute/IP. Other tabs/apps sharing an IP also count toward its limit.

Changing capacity is effective on the next deployment. Changing saved records requires a refresh:

1. Edit and commit `web/config.json`.
2. In GitHub **Actions → Label Compare · Check and publish → Run workflow**, select **Refresh the saved labels listed in web/config.json**.
3. The workflow fetches every configured example, validates/tests/builds, and publishes only after successful checks. A failed fetch leaves the previous saved data intact. Refresh the website after the deploy job succeeds.

Or locally:

```sh
python3 scripts/refresh_examples.py
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

Commit the config and `web/data/examples.json` with any relevant code changes; do not commit `dist/`. A normal push rebuilds the saved data; live barcode lookups always fetch on demand. There is no automatic example-refresh schedule. Empty `exampleBarcodes` and `initialBarcodes` are supported for a blank starting desk. Add nutrient rows in `web/model.mjs` (`NUTRIENTS`) and add their source fields if necessary; monetary-style rounding or cross-product health scores are not applied.

## API, registration and privacy

No API key or secret is needed for Open Food Facts **read** requests. The application uses the current `/api/v3/product/{barcode}` endpoint and requests only relevant fields. CORS was checked against the production endpoint. Browser requests identify the app using the documented `User-Agent` query parameter because browsers do not reliably allow a custom User-Agent header. The Python collector sends an identifying User-Agent header. The app does not make product writes.

Open Food Facts asks app developers to create an app account and fill in its [API usage form](https://docs.google.com/forms/d/e/1FAIpQLSdIE3D8qvjC_zRJw1W8OmuHhsWJ_NSckiiniAHlfaVwUZCziQ/viewform). This is an owner setup task, not a visitor requirement, and no credentials belong in this repository. Suggested description: “Label Compare at https://coolcode.ca/labelcompare/ is a free public browser comparison of food nutrition, ingredients, reported allergens and missing data. Visitors request individual barcodes; responses are cached in the current tab, requests are spaced at least five seconds apart, and the tab budget is twelve reads per minute. No writes, advertising profiles or bulk crawling. Open Food Facts attribution and reuse licences are displayed and retained in receipts.”

Only an explicitly looked-up barcode and ordinary connection information go to Open Food Facts. Product pictures are requested from its image service when displayed. Imports stay in the browser. No shopping history, health profile, account details, API keys or passwords are stored by Label Compare. Downloads are under the visitor’s control. Existing CoolCode aggregate visit counting follows the hub’s preferences.

## Data sources and reuse

- [Open Food Facts API documentation](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/) and [v3 product lookup](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/).
- Product database: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); individual contents: [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/). Dated saved records and exported receipts retain those terms.
- Product images: Open Food Facts contributors, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Images are displayed without alteration; packaging may contain separately protected material. Every card links to its original record.
- [Provider reuse guidance](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/).

Data is community-contributed, not independently verified. A record may describe another market or formulation. Source edit dates and retrieval dates have different meanings. The starter records are not a representative Canadian grocery sample.

Related tools: [Canadian Price Atlas](https://coolcode.ca/priceatlas/) and [Pantry Prices](https://coolcode.ca/pantryprices/).

## Build and test

Uses standard Python and browser JavaScript; no runtime dependencies. The default build is offline. CI runs the Node model tests, Python build/collector tests and a browser check at a project subpath, then publishes `dist/` to GitHub Pages. Browser tests intercept provider calls with retained real source responses, so external API availability cannot mask an application defect.
