"""Run against tests/browser-server.mjs. Uses only local, fictional test data.

Requires Python Playwright and Chromium. No real payment or message is sent.
"""
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

artifacts = Path(os.environ.get('TRADE_QA_ARTIFACTS', '/tmp/worknic-trade-qa'))
artifacts.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8085/trade/')
    page.get_by_text('사업자 계정으로 로그인하거나 가입을 신청해 주세요.').wait_for()
    page.get_by_text('처음 오셨나요? 사업자 회원가입').click()
    signup = page.locator('#signup-form')
    username = 'qa_' + str(time.time_ns())
    values = {'username': username, 'password': 'browser simple passphrase', 'companyName': '브라우저 검증 사업장',
              'businessNumber': '1234567891', 'contactName': '검증 담당자', 'phone': '010-0000-0000',
              'email': 'browser@example.invalid', 'postalCode': '11111', 'address': '테스트 배송지', 'addressDetail': '검증 전용'}
    for key, value in values.items():
        signup.locator('[name=' + key + ']').fill(value)
    signup.locator('[name=consent]').check()
    signup.get_by_role('button', name='사업자 가입 신청').click()
    page.get_by_text('사업자 가입을 접수했습니다.', exact=False).wait_for()
    login = page.locator('#login-form')
    login.locator('[name=username]').fill(username)
    login.locator('[name=password]').fill(values['password'])
    login.get_by_role('button', name='로그인', exact=True).click()
    page.get_by_role('heading', name='사업자 정보를 확인하고 있습니다.').wait_for()

    admin = browser.new_page(viewport={'width': 1440, 'height': 1100})
    admin.on('pageerror', lambda e: errors.append(str(e)))
    admin.goto('http://localhost:8085/trade/admin')
    admin.locator('#admin-login').wait_for(state='visible')
    admin.locator('[name=username]').fill('qa_staff')
    admin.locator('[name=password]').fill('local test passphrase')
    admin.get_by_role('button', name='로그인', exact=True).click()
    member = admin.locator('#members-view .card').filter(has_text=username)
    member.wait_for()
    admin.on('dialog', lambda d: d.accept())
    member.get_by_role('button', name='사업자 확인 후 승인').click()
    admin.get_by_text('회원 상태를 변경했습니다.').wait_for()

    page.reload()
    page.get_by_role('button', name='장바구니 담기', exact=True).wait_for()
    page.screenshot(path=str(artifacts / 'catalog-desktop.png'), full_page=True)
    page.get_by_role('button', name='장바구니 담기', exact=True).click()
    page.locator('.trade-nav a[href="#cart"]').click()
    page.locator('#cart-items .cart-row').wait_for()
    assert '55,000원' in page.locator('#cart-totals').inner_text()
    page.locator('[name=shippingConfirmed]').check()
    page.locator('[name=acceptTerms]').check()
    page.get_by_role('button', name='주문하고 거래명세서 받기').click()
    page.locator('#orders .order-card').wait_for()
    assert '입금 대기' in page.locator('#orders').inner_text()
    assert '배송·포장비' in page.locator('#orders').inner_text()
    page.screenshot(path=str(artifacts / 'order-desktop.png'), full_page=True)
    with page.expect_popup() as popup:
        page.get_by_role('link', name='거래명세서·인쇄').click()
    document = popup.value
    document.wait_for_load_state()
    assert '556-910020-91004' in document.locator('body').inner_text()
    assert '배송·포장비' in document.locator('body').inner_text()
    document.emulate_media(media='print')
    document.pdf(path=str(artifacts / 'statement-sample.pdf'), format='A4')
    document.close()

    admin.get_by_role('link', name='주문·배송', exact=True).click()
    admin.get_by_role('button', name='새로고침', exact=True).click()
    # Locate this buyer's order even when the fixture has previous test orders.
    orders = admin.locator('#admin-orders .order-card').filter(has=admin.locator('input[name=reference]'))
    order = orders.first
    order.locator('[name=reference]').fill('QA 검증 은행내역')
    order.locator('[name=bankChecked]').check()
    order.get_by_role('button', name='입금 확인 처리').click()
    admin.get_by_role('button', name='배송 준비 시작').wait_for()
    admin.get_by_role('button', name='배송 준비 시작').click()
    admin.locator('[name=carrier]').wait_for()
    admin.locator('[name=carrier]').fill('검증 택배')
    admin.locator('[name=tracking]').fill('1234567890')
    admin.get_by_role('button', name='발송 완료 처리').click()
    admin.get_by_text('발송 완료로 변경했습니다.').wait_for()
    page.get_by_role('button', name='새로고침', exact=True).click()
    page.get_by_text('검증 택배 · 운송장 1234567890').wait_for()
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(artifacts / 'order-mobile.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile overflow'
    page.locator('.trade-nav a[href="#catalog"]').click()
    page.screenshot(path=str(artifacts / 'catalog-mobile.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Catalog overflow'
    assert not errors, errors
    browser.close()
    print('PASS: signup → approval → cart → statement/PDF → bank confirmation → preparing → shipped → tracking; desktop/mobile; no JS errors')
