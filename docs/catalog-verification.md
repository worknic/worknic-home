# Catalog consistency verification — 2026-11-07

- Source: OS_브랜드상품, 23 brands, 949 unique product IDs; public 41, private review drafts 908.
- Makita: 807 seller-screen rows extracted; 278 new private drafts. All 280 Makita records (including two existing public products) partition exactly once into power tools, batteries/chargers, cutting accessories, storage, measuring, or replacement parts. No duplicated product records.
- Brand collection links retain brand scope, including industrial consumables. Search query, browser navigation and reset behavior checked.
- Public lists, legacy dialogs and product pages require published === true and a published registered brand. Unknown categories remain excluded.
- Festool Systainer stays inside Festool; existing product and variant IDs are reused.
- Existing 41 guides render through the same presentation template. Unverified reviews and usage images stay omitted.
- Apps Script Catalog.gs version 12: preserve existing guide, collections, manufacturer part number, variants and import provenance from stored data; reject brand/model changes for an existing guide; new publication requires stored quality.state = reviewed. Caller-supplied review metadata cannot bypass this guard. Existing public records remain editable.
- Admin checks server metadata-preservation capability before saving records with extended metadata. Source-check dates are no longer replaced merely by editing an item.

## Remaining checks

- A live authenticated administrator save round trip has not been exercised in this verification. Preservation and draft-publication behavior passed isolated server tests, and production public API reports the new capabilities.
- 278 Makita drafts still require original product images and manufacturer/model/configuration checks. They are not public-ready products.
- Actual thumbnail file backgrounds are not yet unified: one approved grey thumbnail (DTD158Z), 23 high-resolution replacements pending, 17 other public originals retained.
- Selling unit, domestic package contents and options require final comparison for all 41 existing public products. No unverified specifications or consumer reviews were added.
- PR #3 B2B ordering remains an unmerged draft; this release does not enable ordering or card payments.
