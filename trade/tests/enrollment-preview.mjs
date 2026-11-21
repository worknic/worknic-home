// LOCAL SYNTHETIC REVIEW ONLY. This file is not a production entry point.
import {createServer} from 'node:http';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';import {mkdirSync} from 'node:fs';import {join} from 'node:path';import {openStore} from '../server/store.mjs';import {createTradeServer} from '../server/http.mjs';import {signBusinessEvent} from '../server/business-enrollment.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=join(root,'.review-only');mkdirSync(dir,{recursive:true});
const secret='synthetic-only-bridge-'.repeat(3),origin='http://127.0.0.1:4190';
const store=openStore(join(dir,'synthetic.sqlite'),{enrollmentOptions:{enabled:true,secret,encryptionKey:'ab'.repeat(32),origin}});
const application=createTradeServer({store,root,origin,secure:false,betaMode:true,os:{configured:()=>true,status:async(profile,id)=>({id,status:'approved',revision:2}),publicCatalog:async()=>({products:[],brands:[]})}}),handler=application.listeners('request')[0];
const lanOrigin='http://192.168.219.106:4190',lanApplication=createTradeServer({store,root,origin:lanOrigin,secure:false,betaMode:true,os:{configured:()=>true,status:async(profile,id)=>({id,status:'approved',revision:2}),publicCatalog:async()=>({products:[],brands:[]})}}),lanHandler=lanApplication.listeners('request')[0];
const server=createServer(async(req,res)=>{
 if(!['127.0.0.1:4190','192.168.219.106:4190'].includes(req.headers.host)){res.writeHead(400).end();return}
 if(req.url==='/review-start'){
  const requestId='synthetic-'+randomUUID(),profile={companyName:'검토 전용 · 가상 사업자',businessNumber:'3638603519',contactName:'가상 고객',phone:'01000000000',email:'review@example.invalid'},envelope={timestamp:Date.now(),nonce:randomUUID(),payload:{eventId:randomUUID(),requestId,revision:2,status:'approved',contactVerified:true,kind:'existing',profile}};envelope.signature=signBusinessEvent(secret,envelope);store.enrollment.receive(envelope);
  let body;await store.enrollment.dispatchOne({send:async m=>(body=m,{status:'accepted',messageId:'M_SYNTHETIC_PREVIEW',code:'2000'})},{requestId});
  const link=new URL(body.text.split(' ').at(-1));res.writeHead(302,{'Location':link.pathname+link.hash,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return;
 }
 if(req.url==='/review-help'){
  res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WORKNIC 계정 연결 검토</title><style>body{max-width:620px;margin:60px auto;padding:24px;font:16px/1.9 sans-serif;background:#f5f3ee;color:#30392a}a{color:#405b31}</style><h1>사업자 계정 연결 · 격리 검토</h1><p>실제 신청·계정·문자와 연결되지 않습니다.</p><p>예시 휴대폰 번호는 <strong>010-0000-0000</strong>입니다. 새 아이디와 검토용 비밀번호만 사용해주세요. 실제 사용하는 비밀번호는 입력하지 마세요.</p><p><a href="/review-start">새 예시 신청으로 계정 설정 시작</a></p><p>신청 저장→승인→모의 문자 링크→휴대폰 본인 확인→고객 직접 계정 설정→기존 포털 로그인 경로를 확인할 수 있습니다. 모의 문자 전달은 실제 통신사 전송이 아닙니다.</p></html>');return;
 }
 (req.headers.host==='192.168.219.106:4190'?lanHandler:handler)(req,res);
});server.listen(4190,'0.0.0.0',()=>console.log('Synthetic enrollment review: '+origin+'/review-help'));
process.on('SIGINT',()=>server.close(()=>{store.close();process.exit()}));
