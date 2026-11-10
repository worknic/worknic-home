# Brand discovery and website purpose review — 2026-11-10

Scope: homepage and about page. These changes clarify indexing and entity interpretation; they do not guarantee ranking, traffic, AI citations or inclusion in search results.

## Current purpose, incorporating the owner's correction

The official site introduces handled brands and products, communicates WORKNIC's philosophy and direction to individuals, and connects retail businesses seeking procurement. It is not presented as a consumer shopping venue. Retailers undergo business-information verification and WORKNIC approval; a representative provides prices and supply terms in a quotation. Verification alone does not promise an immediate price unlock.

- Homepage title: `WORKNIC 워크닉 | 취급 브랜드·제품 소개와 도구 문화`.
- About title: `워크닉 소개 | 도구를 고르는 철학과 방향성 · WORKNIC`.
- Updated descriptions, matching Open Graph/Twitter metadata, Organization description and page structured-data names/descriptions to reflect this purpose.
- Kept the homepage slogan, styling and compact introduction; the introduction now explains philosophy, handled brands/products and the retailer quotation path.
- About text explains the site's individual and retailer audiences explicitly.
- Removed online-store promotion from SEO descriptions and introductory copy. All existing official-channel/source links remain unchanged, as requested.
- Preserved stable Organization, WebSite, HardwareStore and page identifiers, physical-store facts, logo/image references, navigation, footer, scripts and brand-directory container. No offers, prices or transaction actions were added.

## Checks for this purpose correction

Passed: both JSON-LD graphs parse; title/description match page schema and OG/Twitter values; no online-store promotion in meta descriptions; every href and footer unchanged; `git diff --check`.

The earlier deployed version passed desktop browser checks for homepage layout, catalog search/reset/product roundtrip and Festool collection/brand switching. Those checks predate this copy correction and are not a visual verification of its final text. Mobile checks, external rich-result validation and indexing measurements remain separate.
