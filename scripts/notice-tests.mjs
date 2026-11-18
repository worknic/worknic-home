import {active,koreanDay,hiddenReason} from '../notice/popup.js';import assert from 'node:assert/strict';
const config={enabled:true,id:'worknic-20261120',image:'/assets/notices/worknic-20261120.png',expiresAt:'2026-11-21T00:00:00+09:00'};
assert(active(config,Date.parse('2026-11-20T23:59:59+09:00')));assert(!active(config,Date.parse('2026-11-21T00:00:00+09:00')));assert(!active({...config,enabled:false}));assert(!active({...config,image:'https://other.example/x.png'}));assert(!active({...config,expiresAt:'bad'}));assert.equal(koreanDay(Date.parse('2026-11-20T15:00:00Z')),'2026-11-21');console.log('PASS: KST end-of-event boundary, disabled/malformed config and local image allowlist.');
const key='worknic-notice-worknic-20261120',day='2026-11-18';
assert.equal(hiddenReason(()=>null,key,day),'');assert.equal(hiddenReason(s=>s==='localStorage'?day:null,key,day),'hidden-today');assert.equal(hiddenReason(s=>s==='sessionStorage'?'closed':null,key,day),'closed-session');assert.equal(hiddenReason(s=>s==='localStorage'?'2026-11-17':null,key,day),'');
console.log('PASS: new visitors, today hiding, session hiding and next-day reappearance remain distinct.');
