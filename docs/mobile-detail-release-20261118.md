# Mobile header and product detail UI

Based on production `8e7589c70d95df8e6e140798ce443bfc9900a0fb`.

- Homepage at <=800px: left logo, 44px menu, 52px inline search, 44px brand link. Existing language engine moves into the menu and shows full language names; desktop position is restored when resizing.
- Product detail: existing description/specification/source sections share the right information column. Sticky columns are bounded by actual content; a single existing photo remains visible beside long information. Multiple photos remain a vertical desktop gallery. No photos or product facts are fabricated.
- Mobile gallery: horizontal native scrolling, previous/next buttons and one dot per available photo, hidden for zero/one photo. Scroll position synchronizes dots. Arrow/Home/End keys, reduced motion, modal zoom and focus return are supported.
- Assortment search normalizes spaces between Latin letters and digits with NFKC/case normalization. `M337` and `M 337` both return 10 matches in the current 39,797-row public snapshot.

Verification: real Chrome at 1440x1000 and 390x844, home/menu open-close/Escape, KO/EN/JA, submitted search and back, M337/DML811 single photo, DTD158 two photos, horizontal gesture/dots/arrows, keyboard and zoom, long specifications, local no-photo fixture, no horizontal page overflow. Local previews disable live product refresh and contain no transactional submissions.

Checks: JavaScript syntax and git whitespace pass. Existing catalog and product runtime assertions pass; HTML checker passes all 323 sitemap pages. Every data/server file and all existing product facts were compared to baseline unchanged; 276 product HTML pages only change gallery stylesheet/script asset references.

Existing generator check failures reproduced in a clean baseline and candidate: `build-search-pages.mjs --check` (missing brands template marker), `product-page-tests.mjs --check` (generated snapshot differs while runtime assertions pass), `build-sitemap.mjs --check` (existing sitemap differs). These predate this release and were not hidden or repaired by rewriting product data.

No OS product save/publication, orders, payments, customer enquiries or source catalog writes were performed. Roll back with a normal revert of this UI commit; do not force reset over other work.
