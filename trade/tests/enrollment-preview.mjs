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
  const requestId='synthetic-'+randomUUID(),profile={companyName:'���� ���� �� ���� �����',businessNumber:'3638603519',contactName:'���� ����',phone:'01000000000',email:'review@example.invalid'},envelope={timestamp:Date.now(),nonce:randomUUID(),payload:{eventId:randomUUID(),requestId,revision:2,status:'approved',contactVerified:true,kind:'existing',profile}};envelope.signature=signBusinessEvent(secret,envelope);store.enrollment.receive(envelope);
  let body;await store.enrollment.dispatchOne({send:async m=>(body=m,{status:'accepted',messageId:'M_SYNTHETIC_PREVIEW',code:'2000'})},{requestId});
  const link=new URL(body.text.split(' ').at(-1));res.writeHead(302,{'Location':link.pathname+link.hash,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return;
 }
 if(req.url==='/review-help'){
  res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WORKNIC ���� ���� ����</title><style>body{max-width:620px;margin:60px auto;padding:24px;font:16px/1.9 sans-serif;background:#f5f3ee;color:#30392a}a{color:#405b31}</style><h1>����� ���� ���� �� �ݸ� ����</h1><p>���� ��û�����������ڿ� ������� �ʽ��ϴ�.</p><p>���� �޴��� ��ȣ�� <strong>010-0000-0000</strong>�Դϴ�. �� ���̵�� ����� ��й�ȣ�� ������ּ���. ���� ����ϴ� ��й�ȣ�� �Է����� ������.</p><p><a href="/review-start">�� ���� ��û���� ���� ���� ����</a></p><p>��û �������Ρ���� ���� ��ũ���޴��� ���� Ȯ�Ρ���� ���� ���� ��������� ���� �α��� ��θ� Ȯ���� �� �ֽ��ϴ�. ���� ���� ������ ���� ��Ż� ������ �ƴմϴ�.</p></html>');return;
 }
 (req.headers.host==='192.168.219.106:4190'?lanHandler:handler)(req,res);
});server.listen(4190,'0.0.0.0',()=>console.log('Synthetic enrollment review: '+origin+'/review-help'));
process.on('SIGINT',()=>server.close(()=>{store.close();process.exit()}));
