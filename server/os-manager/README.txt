WORKNIC OS website manager source, 2026-11-08.
Production URL: https://worknic.tools/site-manager/
Runs on the existing OS admin session, with server-side admin checks.
Backend: server/Catalog.gs; preserve existing Code.gs, BusinessMembers.gs and WorknicHosting.gs.
Separate Sheets: OS_홈페이지편집 and OS_홈페이지수정이력. Existing OS_브랜드상품 remains publication source.
Netlify image uploads use @netlify/blobs with server-injected credentials; no new API token or client secret. Original PNG/JPEG/WebP bytes are preserved, maximum 3 MiB. Draft images require OS admin authentication until referenced by a published record.
Preview is generated from the exact official product renderer; current public records are not modified by saving a draft.
Snapshot restoration creates a draft; manual review is needed again before publishing. Revisions reject concurrent stale edits.
The existing OS deploy snapshot must be retained when assembling a release; these files are a module, not a replacement for all OS tools.
B2B order PR #3 remains a separate undeployed draft.
