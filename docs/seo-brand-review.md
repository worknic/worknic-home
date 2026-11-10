# Brand discovery metadata review — 2026-11-10

Scope: homepage and about page. These changes support clearer indexing and entity interpretation; they do not guarantee ranking, traffic, AI citations or inclusion in search results.

- Replaced the location-first homepage title with `워크닉 WORKNIC | 전동공구·수공구 공구매장과 도구 문화 브랜드`.
- Added distinct Korean descriptions and matching Open Graph/Twitter metadata, Korean locale, site name and existing share-image references.
- Linked Organization, WebSite, HardwareStore and page entities with stable absolute identifiers. The about page uses AboutPage. Existing company name, contact details, store address and hours remain unchanged. Official channels come from existing footer links; logo and store image use existing assets. No unsupported search action, delivery area, price, rating, award or founding-date claim was added.
- Kept the homepage slogan and visual classes while clarifying the short introduction: tool store, tool-culture brand, electric/hand tools, field supplies and online browsing. About copy connects the physical shop to the existing online store and tool journal.
- Preserved the Pocheon shop's identity, footer text, all navigation destinations, scripts and brand-directory container. Nationwide relevance is conveyed through accessible online information, not a claim of nationwide delivery or additional locations.

## Checks

Passed: JSON parsing of both structured-data graphs; one title and H1 per page; unique description and Twitter card/title/description/image fields; exact preservation of store address, hours, phone and email; unchanged footer and navigation destinations; unchanged brand-directory container; `git diff --check`.

Not run in this focused review: rendered desktop/mobile visual QA, external rich-result validation, Search Console/Naver inspection or live deployment verification. Metadata alone cannot establish actual search visibility; these checks and indexing measurements remain separate.
