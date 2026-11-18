# 상품코드별 공개 콘텐츠 관리

기존 상세 UI e301e3a 및 행사 팝업/생성 검사 수정 0933f09를 보전한다. OS 백엔드는 기존 배포 URL을 유지한 버전24, OS 화면은 Netlify 6afd4b8d5318329a7cad32d1로 배포했다. 공식 홈페이지 병합 클라이언트는 이 소스의 배포로 연결된다. 실제 품목의 초안·발행본·가격·재고는 수정하지 않았다.

## 실제 기존 경로

- OS `site-manager/manager.js` → 기존 Apps Script `catalog.saveDraft` → `catalog.reviewDraft` → `catalog.publishDraft`.
- `server/Catalog.gs`: 초안은 `OS_홈페이지편집`, 이력은 `OS_홈페이지수정이력`, 공개 카탈로그는 `OS_브랜드상품`에 분리되어 있다. 기존 상품은 브랜드 필수 검증을 통과해야 한다.
- 공식 상세 `products/guide.js`는 `catalog.get` 성공 시 공개된 상품·브랜드만 렌더링한다. 실패 시 배포된 정적 상세를 유지한다. 목록 `catalog.js`는 정적 search-catalog를 우선 읽고 공개 API를 조회하며 60초 주기로 갱신한다.
- 기존 `catalog.get`는 80,000자 미만 응답만 ScriptCache에 60초 저장한다. 기존 발행 로직은 공개 카탈로그 캐시를 무효화한다. 브라우저 갱신과 정적 HTML/SEO 재생성은 별개다.
- 취급 목록 `assortment/app.js`는 `/data/assortment.json` 39,797개를 읽는다. `assortment-detail-links.json`에는 현재 22개 상품코드와 서로 다른 기존 상세 경로 22개가 검증 연결되어 있다. 그 외 품목을 브랜드 카탈로그에 자동 삽입하지 않는다.

## 추가 구현

1. `server/ProductContent.gs`: `catalog.content.*` 액션, 별도 `OS_상품콘텐츠이력` append-only 시트. 상품코드별 상태/수정 번호/행위/시각/관리자/스냅샷을 한 행으로 함께 기록한다. 기존 catalog 라우터에 content 전용 분기를 추가했다. 쓰기는 기존 `admin_`와 ScriptLock을 사용한다. 공개 읽기는 시트를 생성하지 않는다.
2. OS `/site-manager/content/`: 원본 목록 검색 → 초안 → 콘텐츠 미리보기 → 4개 항목 검수 → 발행. 원본 가격은 읽기 전용이다. 수정 충돌 시 입력을 유지하고 새로 불러와 비교할 수 있다. 이력 복구는 초안만 만든다. 사진은 검증된 공개 HTTPS URL을 입력한다. 새 업로드 저장소는 만들지 않았다.
3. `content/public-content.js`: 무인증 공개 조회에는 `credentials: omit`, `cache: no-store`, 5초 제한, 최대 120개 코드별 배치를 사용한다. 발행된 콘텐츠만 응답한다. 설명·사진·규격·출처·확인일만 화이트리스트로 병합하고 가격/재고/이름/브랜드/상품 ID는 유지한다. 빈 설명·규격은 기존값을 유지한다. 조회 실패/미등록/중복 상세 매핑은 기존 화면으로 돌아간다.
4. 기존 22개 연결 상세와 카탈로그 목록에 공개 콘텐츠를 병합한다. 취급 목록은 보이는 행에만 조회해 썸네일·설명·펼칠 수 있는 규격을 붙인다. 기존 상세 연결이 없는 발행 품목은 `/assortment/detail/?code=...`로 연결한다. 이 공통 품목 상세에는 브랜드가 필요 없다. 잘못된 코드는 오류, 추가 콘텐츠가 없으면 원본 품목과 문의 안내를 표시한다.

## 상태 및 보호

- `saveDraft`: 상품코드가 원본 취급 목록에 실제 존재하는지 확인하고 새 초안을 저장한다. 현재 발행본은 유지한다.
- `review`: 저장한 수정 번호와 4개 검수 항목, 출처 및 실제 날짜가 필요하다.
- `publish`: 최신 검수본만 발행하며 저장 후 바뀐 초안은 다시 검수해야 한다.
- `unpublish`: 새 조회부터 기존 표시로 돌아간다. 이력을 삭제하지 않는다.
- 모든 변경은 현재 revision을 요구한다. 동시 창의 오래된 revision은 `CONFLICT`로 거부한다.
- 원본 가격·재고·이름·브랜드 등 미허용 필드는 서버에서 거부한다. HTML은 입력할 수 있지만 UI는 textContent로 표시하여 실행하지 않는다.

## 검증

`node --test scripts/product-content-tests.mjs` — 격리 Apps Script 서비스 더블로 초안 비공개, 검수 전 발행 거부, 수정 충돌, 발행, 발행 해제, 이력 복구, 관리자 인증, 금지 필드/URL/날짜/크기 검증, 원본 불변, 네트워크 fallback을 검사한다.

별도 로컬 `content-test-server.mjs`는 실제 ProductContent.gs를 메모리 Sheet 더블에서 실행한다. 쓰기는 절대로 외부에 전달하지 않는다. 시험 품목 TEST-001, 연결 테스트 상세 TEST-PRODUCT만 사용한다. Chrome에서 초안 저장 시 원본 설명 유지 → 검수·시험 발행 후 사진/대체텍스트/설명/규격 반영 → 발행 해제 후 원본 설명/규격 복구를 확인했다. 상품코드 공통 상세의 원본 기준판매가 3,000원도 유지됐다. 실제 Google Sheet/운영 API에 쓰는 검증은 하지 않았다.

## 활성화와 남은 배포 요건

현재 운영 Netlify 6afb7bbd94fae678d2c0597e의 전체 소스 내보내기를 확보했고 공개 파일78개를 모두 운영과 바이트 비교했다. 기존 함수10개와 공통 서버 파일6개는 변경 없이 보전했다. Apps Script14개 기존 파일도 로컬 백업했다. 최종 doPost는 TradeBridge에서 기존 legacy 라우터로 전달하고, Code.gs의 catalog.* 분기가 새 콘텐츠 요청도 받는다. 현재 편집본 수정 시각은 기존 운영 버전23 생성 이전으로 확인했다.

OS 배포에는 최신 전체 소스에 새 `site-manager/content` 모듈과 기존 관리화면 링크만 합쳤다. `node server/os-manager/build-content-module.mjs`로 공통 어댑터를 복사한다. Apps Script 최신 Catalog.gs의 기존 변경을 보전하여 content 분기를 병합하고 ProductContent.gs만 추가한다. 기존 doPost가 `catalog.content.*`도 worknicCatalogRoute_로 전달하는지 확인해야 한다. 기존 권한은 넓히지 않는다. 최초 실제 초안 쓰기 또는 발행 시험이 필요하면 먼저 별도 범위를 정해야 한다.

홈페이지 병합 클라이언트는 백엔드와 OS 기능 검증 후 별도 배포한다. 최초 기능 활성화에는 이 배포가 필요하다. 이후 콘텐츠 저장·발행은 코드 재배포 없이 다음 페이지 조회에 반영된다. 이미 열린 상세는 새로고침이 필요하며, 카탈로그 목록은 기존 60초 주기로 갱신된다. 취급 목록도 새 검색/새로고침 시 갱신된다. 이미지 URL이 같고 원본 바이트만 바뀌면 외부 이미지 CDN/브라우저 캐시가 남을 수 있으므로 새 이미지 URL을 사용한다.

공개 콘텐츠는 정적 assortment 가격·재고나 detail-links를 갱신하지 않는다. 정적 HTML/JSON-LD/사이트맵과 검색 엔진 SEO 스냅샷은 별도 공개 자료 검수·생성·배포·재수집이 필요하다. 새 상품코드 공통 상세는 query 기반으로 noindex이며, 정식 SEO 경로를 임의 생성하지 않는다. 운영 활성화 시 JS 캐시 버전을 갱신해야 한다.

추가 제한: 이력 조회·공개 읽기는 편집된 품목의 이벤트 시트를 스캔한다. 대량 콘텐츠/장기 이력이 커지면 별도 materialized public index가 필요하다. 원본 취급 목록도 여전히 정적 스냅샷이며 실시간 재고라고 표시하지 않는다. 로컬 테스트는 실제 Google Apps Script/Sheets의 제한과 지연을 대체하지 않는다.

2026-11-18 배포 참고: 최초 OS ZIP 배포 6afd4ab7a21fddda5a3d94d6은 초기화 시 디렉터리 권한 오류로 실패했다. 원본 파일 바이트를 보전하고 ZIP 파일 항목에0644 권한/Unix 형식을 지정한 portable 패키지로 재배포하여 성공했다. 기존 설정·환경변수·트리거·Sites freeze 관련 값은 변경하지 않았다.
