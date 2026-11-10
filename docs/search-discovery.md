# Search discovery update — 2026-11-10

The official GitHub Pages site is built from this repository's main branch and CNAME worknic.co.kr.

## What changed

- 276 products already public in the catalog now have readable HTML at `/products/<id>/`, including existing model information, specifications, source links and source-check dates. No product was newly approved or published in the catalog.
- 23 brand pages, 7 tool-category pages, 2 field-supply category pages and the existing catalog/directory pages contain static product links and readable Korean content.
- Product and collection canonical URLs, descriptive titles, descriptions, Open Graph metadata and JSON-LD are provided without invented prices, availability, ratings or reviews.
- The homepage identifies WORKNIC as a tool store and tool-culture brand before its location. Pocheon store details, business prices and approval conditions are unchanged.
- The sitemap lists 323 canonical public pages. Legacy product query URLs use an exact route allowlist; unknown product requests remain noindex.
- Search and filters still work. Static catalog content remains when the public API is unavailable; a notice explains that current status and supply conditions need confirmation. A successful live API response removes items no longer public from the interface and corresponding structured data.

## Data and maintenance

`data/catalog.json` is the current reviewed public catalog snapshot. Its 23 brands and 276 product records were compared field-for-field with the live `catalog.get` public API on 2026-11-10. The API response's request timestamp differs and is not a product change.

Static pages are a publication snapshot. After catalog publication, unpublication or model/content changes, update the reviewed **public-only** snapshot, regenerate and deploy these pages. Live interface refresh does not rewrite the deployed HTML. Search caches may also retain older copies until recrawl. No background publication schedule or additional credentials were created by this change.

From repository root, using Node.js 24 (no JavaScript dependencies required):

```sh
node scripts/build-search-pages.mjs
node scripts/build-product-pages.mjs
node scripts/build-sitemap.mjs
node scripts/build-search-pages.mjs --check
node scripts/product-page-tests.mjs --check
node scripts/catalog-tests.mjs
node scripts/build-sitemap.mjs --check
python scripts/check-search-html.py
```

The Python HTML check requires lxml. Generators reject unsafe IDs, filter unpublished/unclassified records, and remove previously generated routes that are no longer public. Do not use an authenticated all-records export as public website data.

## Verified and not promised

Static HTML, unique metadata, canonicals, public-record filtering, 323 sitemap paths, local links and JSON-LD syntax were checked. Runtime fixture tests cover search/reset, category and brand routes, timeout fallback, confirmed unpublication, and safe legacy redirects. Product source photos and factual content are preserved.

The robots files of both worknic.co.kr and worknic.work returned HTTP 200 and allow public crawling. The journal's sitemap is provided by WordPress/Jetpack and was not changed. Search indexing, AI citations, rankings and traffic are controlled by third-party services and are not guaranteed. External rich-results validation and owner-account search-console inspection are separate checks.

## Rollback

The pre-change production commit is `0b2e2d51e4add36585129b249b33b358276e6ec4`. Revert this search-discovery commit to restore its predecessor without modifying catalog records or business-transaction services. Do not force-reset over later unrelated changes.

## Purpose correction — 2026-11-10

The official site introduces WORKNIC's handled brands/products and its philosophy. Retail-store procurement goes through business verification and WORKNIC approval. It is not a direct consumer checkout site.

The homepage/about metadata and copy now reflect that purpose. Product detail pages distinguish business procurement from general product-information enquiries. The legacy "판매가 미정" presentation and general email price CTA were removed. Pricing is described as information on an issued quotation after business verification/approval, not an instantly unlocked price list. The public trade interface and scripts confirm this process; unauthenticated quote and order requests returned HTTP 401 during verification. At verification, the public health endpoint reported new quote/pickup beta intake disabled. No account, authorization, transaction or operating setting was changed.

Smartstore source links are intentionally retained for product-source confirmation, with their original URLs, scope and check dates. All 276 model/specification records and the public catalog source data remain unchanged. Product information, source fidelity, search/filter flows, privacy boundaries and final static output were checked again before publication.
