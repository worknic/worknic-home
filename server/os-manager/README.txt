WORKNIC OS website manager source, 2026-11-08.
Production URL: https://worknic.tools/site-manager/
Runs on the existing OS admin session, with server-side admin checks.
Backend: server/Catalog.gs; preserve existing Code.gs, BusinessMembers.gs and WorknicHosting.gs.
Separate Sheets: OS_홈페이지편집 and OS_홈페이지수정이력. Existing OS_브랜드상품 remains publication source.
Netlify image uploads use @netlify/blobs with server-injected credentials; no new API token or client secret. Original PNG/JPEG/WebP bytes are preserved, maximum 3 MiB. Draft images require OS admin authentication until referenced by a published record.
Preview is generated from the exact official product renderer; current public records are not modified by saving a draft.
Snapshot restoration creates a draft; manual review is needed again before publishing. Revisions reject concurrent stale edits.
The existing OS deploy snapshot must be retained when assembling a release; these files are a module, not a replacement for all OS tools.
Gallery update 2026-11-18: preserve up to 10 source URLs; official detail and OS preview display the first 7 (including the representative). Positions 8-10 are retained as archive photos. Reorder to select the displayed subset. Fewer photos remain fewer; no duplication or blank slides.
gallery-import.js reads the offline review JSON for the exact current legacy/channel product ID and source store. Only ordered image URLs populate the form; save/review/publication remain separate. It does not map internal SKU codes or import price, stock, specifications, or publication state. Server limits are advertised so an older backend cannot silently truncate a larger gallery.
preview.html and preview.js here preserve the existing OS internal preview frame; they are not a claim that its styling matches the latest official detail page. Product-code content still supports a thumbnail only until a separately verified SKU/gallery extension is implemented.
B2B order PR #3 remains a separate undeployed draft.
