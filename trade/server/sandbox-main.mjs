// Isolated, disposable validation service. Never use this entry point for WORKNIC production.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {openStore,TradeError} from './store.mjs';
import {createTradeServer} from './http.mjs';
import {createOSAdapter} from './os-adapter.mjs';
import {createExistingOSBusinessSms} from './business-solapi.mjs';
const allowedId='911d7c48-6fa4-4677-afd2-2104f57ed699';
const port=Number(process.env.PORT||4192),root=fileURLToPath(new URL('../../',import.meta.url));
const origin=process.env.RENDER_EXTERNAL_URL||process.env.WORKNIC_SANDBOX_ORIGIN||`http://127.0.0.1:${port}`;
const secret=process.env.WORKNIC_SANDBOX_BRIDGE_SECRET||'',key=process.env.WORKNIC_SANDBOX_DATA_KEY||'';
if(secret.length<32||!/^[a-f0-9]{64}$/i.test(key))throw Error('Separate sandbox secrets required');
if(!/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin)&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Sandbox origin must be an isolated Render service or loopback');
const configured=!!process.env.WORKNIC_SANDBOX_GAS_ENDPOINT;
const unavailable=()=>{throw new TradeError('격리 GAS 연결을 준비하고 있습니다.',503)};
const os=configured?createOSAdapter({endpoint:process.env.WORKNIC_SANDBOX_GAS_ENDPOINT,sharedSecret:secret}):{configured:()=>false,status:unavailable,businessSms:unavailable,publicCatalog:async()=>({products:[],brands:[]})};
const store=openStore(resolve(process.env.WORKNIC_SANDBOX_DATA_DIR||'/tmp','worknic-account-sandbox.sqlite'),{enrollmentOptions:{enabled:true,secret,encryptionKey:key,origin}});
const receive=store.enrollment.receive.bind(store.enrollment);
store.enrollment.receive=envelope=>{if(envelope?.payload?.requestId!==allowedId)throw new TradeError('격리 시험 대상이 아닙니다.',403);return receive(envelope)};
const provider=createExistingOSBusinessSms(os,{allowSend:configured&&process.env.WORKNIC_SANDBOX_SMS_ARMED==='true'});
const app=createTradeServer({store,root,origin,secure:origin.startsWith('https:'),betaMode:true,os,businessSms:provider,businessSmsMode:'test',businessSmsAllowedRequests:process.env.WORKNIC_SANDBOX_SMS_ARMED==='true'?[allowedId]:[]});
const handler=app.listeners('request')[0],digest=x=>createHash('sha256').update(x).digest();
const server=createServer((req,res)=>{
 if(req.url==='/sandbox-report'){
  if(!timingSafeEqual(digest(req.headers.authorization||''),digest('Bearer '+secret))){res.writeHead(401).end();return}
  const messages=store.enrollment.messages({role:'admin',status:'approved'},allowedId);
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({sandbox:true,gasConfigured:configured,smsArmed:process.env.WORKNIC_SANDBOX_SMS_ARMED==='true',messages}));return;
 }
 handler(req,res);
});
let busy=false;
const timer=setInterval(async()=>{if(busy||!configured||process.env.WORKNIC_SANDBOX_SMS_ARMED!=='true')return;busy=true;try{
 await store.enrollment.dispatchOne(provider,{requestId:allowedId});
 for(const row of store.enrollment.pendingResults())if(row.request_id===allowedId)await store.enrollment.refreshMessage(provider,row.event_key);
}catch{console.error('Sandbox notification check required')}finally{busy=false}},15000);timer.unref();
server.listen(port,process.env.HOST||(process.env.RENDER_EXTERNAL_URL?'0.0.0.0':'127.0.0.1'),()=>console.log('Isolated account sandbox ready; WORKNIC production is not connected'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>{store.close();process.exit(0)})});
