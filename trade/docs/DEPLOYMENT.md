# 운영 연결과 복구

## 구성과 현재 상태

공식 GitHub Pages와 Netlify OS는 유지합니다. Node.js 24 단일 프로세스와 영속 볼륨을 사용하는 별도 HTTPS 서버를 배포합니다. 고객·관리·API를 같은 출처에서 제공합니다. 브라우저 CORS는 열지 않습니다.

`render.yaml`은 Render 유료 소형 웹 서비스·싱가포르·1GB 영속 디스크를 준비하는 배포안입니다. 서버 개설은 사용자 승인 후 진행 중입니다. 공식 요금 기준 기본 추정은 서버 월 USD 7 + 1GB 디스크 USD 0.25이며 세금·트래픽 등은 별도입니다. 월 기본 USD 7.25 구성은 사용자 승인을 받았습니다. 저장할 자료는 사업자 계정·견적·주문·암호화된 수령코드입니다. 실제 운영 개인정보 안내와 수령 조건을 검토하고 접수를 여세요.

참고: https://render.com/pricing / https://render.com/docs/disks / https://render.com/docs/blueprint-spec

## 환경변수

| 변수 | 값 |
| --- | --- |
| NODE_ENV | production |
| TRADE_ORIGIN | 배포된 정확한 HTTPS 출처, 경로 없음. Render는 미지정 시 RENDER_EXTERNAL_URL 사용 |
| TRADE_DATA_DIR | /data, 반드시 영속 볼륨 |
| TRADE_PICKUP_KEY | 보안 난수 32바이트의 64자리 hex. DB와 분리 보관. 키를 잃으면 기존 코드 복호화 불가 |
| TRADE_OS_BRIDGE_SECRET | 안전한 난수 영문·숫자·밑줄 32자 이상. Apps Script와 동일 |
| TRADE_ADMIN_TOTP_SECRET | 운영 비상 로그인용 base32 32자 이상. OS SSO는 자체 OS 검증 사용 |
| HOST / PORT | 0.0.0.0 / 플랫폼 제공 포트 |
| TRADE_TRUST_PROXY | 신뢰할 프록시가 X-Forwarded-For를 덮어쓰는 환경에서만 1 |

비밀값을 채팅·GitHub·프론트엔드·명령 인수에 넣지 않습니다. 로컬 검증 fixture의 키를 운영에 쓰지 않습니다. Render 환경변수의 비밀 입력을 사용합니다. 자동 업데이트는 꺼져 있으며 변경 검수 후 배포합니다. 영속 디스크는 단일 서버 전용이므로 배포 중 잠깐 중단될 수 있습니다.

## 기존 OS 보존

`trade/os/`의 정적 파일을 OS `public/trade-manager/`에 추가합니다. `config.js`에는 비밀값 없이 정확한 베타 HTTPS 출처만 지정합니다. OS index에는 관리자 메뉴 `tradeManagerNav`와 `trade-manager/entry.js`를 추가합니다. 전체 OS를 새 앱 파일로 덮어쓰지 마세요.

`build-overlay.cjs`는 기존 OS 원본 index 해시를 운영 root 응답과 대조합니다. 일치할 때만 별도 디렉터리에 복사하고 index의 메뉴·script만 추가합니다. 기존 93개 파일 중 index 하나만 달라졌으며 나머지 92개 바이트 보존을 확인했습니다. 포함된 `preservation-manifest.json`으로 검증할 수 있습니다. 최신 배포가 달라졌다면 최신 원본을 다시 확보합니다.

관리 페이지는 OS의 자체 세션을 정확한 출처·창으로만 전달하고 서버에서 `catalog.authorize`를 검증합니다. OS 토큰은 URL·DB에 저장하지 않고 서버 메모리에 짧게 보관합니다. 기존 OS 비밀번호와 상품 원본을 이동하지 않습니다.

## Apps Script 승인 연결

현재 운영 Apps Script 소스와 배포 버전을 먼저 백업합니다. **기존 Code.gs 전체를 예전 사본으로 교체하지 마세요.**

1. 현재 `function doPost(e)` 이름만 `worknicLegacyDoPost_(e)`로 바꿉니다. 이미 변경됐다면 반복하지 않습니다.
2. `trade/os/TradeBridge.gs`를 새 파일로 추가합니다. 이 파일의 doPost가 새 서명 요청만 처리하고 나머지는 기존 라우트로 그대로 넘깁니다.
3. Script Properties에 WORKNIC_TRADE_BRIDGE_SECRET을 같은 비밀값으로 설정합니다.
4. 기존 웹앱 배포를 새 버전으로 갱신하여 endpoint는 유지합니다.
5. 기존 로그인·발주·매입처·서비스·사업자가입·catalog.get을 확인합니다. 정확히 연결된 회원의 승인·정지 상태가 주문 API에 반영되는지 검증합니다.

브리지는 시간 제한·서명·nonce 재사용 방지 후 가입 요청 ID·사업자번호·이메일이 모두 맞는 한 요청의 상태만 반환합니다. 신규 서버에 전체 회원명부를 복제하지 않습니다.

## 개시 순서

1. 서버·HTTPS·영속 디스크·비밀값·비공개 백업 준비.
2. Apps Script 승인 브리지와 OS 메뉴 연결.
3. 기존 상품 276개 등 실제 공개 원본 동기화 결과 확인. 신규 상품·옵션은 가격 미정·재고 미확정 상태.
4. 판매가 엑셀, 옵션별 수량, 부가세·판매단위 확인.
5. 문서·개인정보·운영 조건을 담당자가 확정. 진접의 정확한 만남 지점, 포천 실물 보관함 및 실제 코드 설정·폐기 절차 확정.
6. 테스트용 승인 계정으로 실제 접수→견적→입금확인→잠금장치 수령까지 검증. 테스트임을 기록하고 고객에게 실제 견적·알림을 보내지 않음.
7. 관리 설정에서 장소·계정 접수·견적 접수를 열고 공식 페이지에 베타 링크 추가.

## 백업·복구

비공개 서버에서 `node trade/server/backup.mjs`를 실행하면 `/data/backups/`에 SQLite 일관성 사본이 생성됩니다. 단순히 실행 중인 sqlite 파일만 복사하면 WAL 변경이 누락될 수 있습니다. 이 백업을 별도의 접근 제한 저장소로 옮기고 보관 주기를 정하세요. 동일 디스크의 백업만으로는 디스크 손실에 대비할 수 없습니다.

복구는 접수를 닫고 서버를 중지한 뒤 복구 DB의 무결성·회원/주문 수·마지막 주문을 대조하여 진행합니다. 암호화키는 별도 복구해야 합니다. 디스크 스냅샷만으로 실시간 DB 복구를 대체하지 않습니다. OS·기존 상품 관리 DB는 이번 서버와 독립되어 있습니다.

문제가 생기면 betaEnabled·registrationEnabled·장소 신청을 닫고 공식 링크를 제거합니다. 기존 OS·공식 사이트로는 영향이 전파되지 않습니다. 수령코드를 실제 잠금장치에서 폐기하지 않은 채 온라인 기록만 삭제하지 마세요.
