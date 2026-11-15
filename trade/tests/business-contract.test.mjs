import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createOSAdapter} from '../server/os-adapter.mjs';
import {createExistingOSBusinessSms} from '../server/business-solapi.mjs';

// Execute the actual GAS sources and Node adapters together, with only platform I/O replaced.
// No network requests, real sheets, provider credentials or customer records are involved.
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'worknic-contract-')),secret='isolated-contract-'.repeat(3);
 const request={id:'synthetic-contract',revision:1,status:'pending',companyName:'�ռ� �����',businessNumber:'3638603519',contactName:'���� �����',phone:'01000000000',email:'contract@example.invalid'};
 const store=openStore(join(dir,'trade.sqlite'),{enrollmentOptions:{enabled:true,secret,encryptionKey:'ab'.repeat(32),origin:'http://localhost'}});
 const sheets=new Map(),nonces=new Map(),props={WORKNIC_TRADE_BRIDGE_SECRET:secret,WORKNIC_BUSINESS_ENROLLMENT_ENABLED:'true',WORKNIC_BUSINESS_SMS_MODE:'test',WORKNIC_BUSINESS_SMS_TEST_REQUEST_ID:request.id};let sends=0,depth=0,late=false;
 const sheet=()=>{const rows=[];return {rows,getLastRow:()=>rows.length,appendRow(r){rows.push([...r])},getRange(r,c,h=1,w=1){return {getValues:()=>Array.from({length:h},(_,i)=>(rows[r-1+i]||[]).slice(c-1,c-1+w)),setValues(v){for(let i=0;i<h;i++)for(let j=0;j<w;j++)rows[r-1+i][c-1+j]=v[i][j]}}}}};
 const ctx={Date,Number,JSON,String,Error,encodeURIComponent,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
  Utilities:{Charset:{UTF_8:'UTF-8'},getUuid:randomUUID,computeHmacSha256Signature:(s,k,charset)=>{assert.equal(charset,'UTF-8','Cross-runtime HMAC requires explicit UTF-8');return [...createHmac('sha256',k).update(s).digest()]}},
  LockService:{getScriptLock:()=>({tryLock(){depth++;return true},waitLock(){depth++},releaseLock(){depth--}})},
  CacheService:{getScriptCache:()=>({get:k=>nonces.get(k),put:(k,v)=>nonces.set(k,v)})},
  SpreadsheetApp:{openById:()=>({getSheetByName:n=>sheets.get(n),insertSheet:n=>{const s=sheet();sheets.set(n,s);return s}}),flush(){}},
  wnbConfig_:()=>({sheetId:'synthetic'}),wnbTables_:()=>({requests:{}}),WNB_HEADERS_:[],wnbRows_:()=>[request],
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})},
  worknicLegacyDoPost_:()=>({text:JSON.stringify({ok:true,data:{legacy:true}})}),
  wsCredentials_:()=>({from:'01000000000'}),
  wsSolapi_(path,body){assert.equal(depth,0,'provider I/O must run outside lock');if(body){sends++;assert.equal(body.messages[0].to,request.phone);return {code:200,data:{messageList:[{messageId:'M_CONTRACT_00001',statusCode:'2000'}]}}}
   if(late){const rows=sheets.get('OS_����ڹ��ڿ���').rows;rows[1][2]='delivered';rows[1][5]='4000';return {code:200,data:{messageList:{M_CONTRACT_00001:{messageId:'M_CONTRACT_00001',statusCode:'2000'}}}}}
   return {code:200,data:{messageList:{M_CONTRACT_00001:{messageId:'M_CONTRACT_00001',statusCode:'4000'}}}};
  },
  UrlFetchApp:{fetch(url,options){assert.equal(depth,0);assert.equal(url,'https://worknic-trade-beta.onrender.com/api/beta/enrollment/events');const result=store.enrollment.receive(JSON.parse(options.payload));return {getResponseCode:()=>201,getContentText:()=>JSON.stringify(result)}}}
 };
 vm.createContext(ctx);for(const name of ['TradeBridge.candidate.gs','BusinessEnrollmentEvents.gs','BusinessEnrollmentSms.gs'])vm.runInContext(readFileSync(new URL('../os/'+name,import.meta.url),'utf8'),ctx);
 const os=createOSAdapter({sharedSecret:secret,fetcher:async(url,options)=>new Response(ctx.doPost({postData:{contents:options.body}}).text,{status:200})});
 return {ctx,request,store,os,props,sheets,sends:()=>sends,setLate:()=>late=true,close(){store.close();rmSync(dir,{recursive:true,force:true})}};
}
test('���� GAS/Node ���� ���: ��û������ �̺�Ʈ�� ���� ���� helper������ ��ȸ ����',async()=>{
 const f=fixture();try{
  assert.equal(f.ctx.wnbEnrollmentQueue_(f.request,'saved',false).state,'queued');f.ctx.processWorknicBusinessEvents();
  const provider=createExistingOSBusinessSms(f.os,{allowSend:true});
  assert.equal((await f.store.enrollment.dispatchOne(provider,{requestId:f.request.id})).status,'accepted');
  assert.equal(f.sends(),1);
  f.request.status='approved';f.request.revision=2;
  assert.equal(f.ctx.wnbEnrollmentQueue_(f.request,'reviewed',true).state,'queued');f.ctx.processWorknicBusinessEvents();
  assert.equal((await f.store.enrollment.dispatchOne(provider,{requestId:f.request.id})).status,'accepted');
  assert.equal(f.sends(),2);
  assert.equal((await f.os.status(f.request,f.request.id)).status,'approved');
  assert.equal((await f.store.enrollment.refreshMessage(provider,f.request.id+':approved:2')).status,'delivered');
  assert.equal(f.sends(),2);assert.ok(!JSON.stringify([...f.sheets.values()].map(s=>s.rows)).includes('#'));
  f.props.WORKNIC_BUSINESS_SMS_TEST_REQUEST_ID='another-request';
  await assert.rejects(provider.send({eventKey:f.request.id+':approved:3',requestId:f.request.id,profile:f.request,text:'�ռ�'}));
  assert.equal(f.sends(),2);
 }finally{f.close()}
});
test('GAS ���� ��� ��ȸ �� Ȯ���� ���� ���´� ���� ���� �������� �ǵ����� ����',async()=>{
 const f=fixture();try{
  const provider=createExistingOSBusinessSms(f.os,{allowSend:true});
  const input={requestId:f.request.id,profile:f.request,eventKey:f.request.id+':received',text:'�ռ� �ȳ�'};
  assert.equal((await provider.send(input)).status,'accepted');f.setLate();
  assert.equal((await provider.status('M_CONTRACT_00001',input)).status,'delivered');
 }finally{f.close()}
});
