/** Additive approval bridge. Existing OS sheets, sessions and routes stay intact.
 * Rename the existing doPost function to worknicLegacyDoPost_ once, then add this file.
 * Set WORKNIC_TRADE_BRIDGE_SECRET (32+ characters) in Script Properties and the same
 * value in the trade server environment. Never put this secret in browser code.
 */
function doPost(e){var q;try{q=JSON.parse(e.postData.contents||'{}')}catch(x){return worknicLegacyDoPost_(e)}if(q.action!=='trade.bridge.status')return worknicLegacyDoPost_(e);var answer;try{answer={ok:true,data:worknicTradeStatus_(q.payload||{})}}catch(x){answer={ok:false,error:'사업자 승인 연결을 확인할 수 없습니다.',code:'UNAUTHORIZED'}}return ContentService.createTextOutput(JSON.stringify(answer)).setMimeType(ContentService.MimeType.JSON)}
function worknicTradeStatus_(p){
 var secret=PropertiesService.getScriptProperties().getProperty('WORKNIC_TRADE_BRIDGE_SECRET')||'';if(secret.length<32||!p.payload||typeof p.nonce!=='string'||!/^[a-f0-9-]{36}$/.test(p.nonce)||!Number.isFinite(p.timestamp)||Math.abs(Date.now()-p.timestamp)>60000||typeof p.signature!=='string'||!/^[a-f0-9]{64}$/.test(p.signature))throw Error('UNAUTHORIZED');
 var message=JSON.stringify({timestamp:p.timestamp,nonce:p.nonce,payload:p.payload}),bytes=Utilities.computeHmacSha256Signature(message,secret),expected=bytes.map(function(b){return('0'+((b+256)%256).toString(16)).slice(-2)}).join(''),different=0;for(var i=0;i<64;i++)different|=expected.charCodeAt(i)^p.signature.charCodeAt(i);if(different)throw Error('UNAUTHORIZED');
 var lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw Error('BUSY');try{var cache=CacheService.getScriptCache(),nonce='trade_nonce_'+p.nonce;if(cache.get(nonce))throw Error('REPLAY');cache.put(nonce,'1',120)}finally{lock.releaseLock()}
 var input=p.payload,no=String(input.businessNumber||''),email=String(input.email||'').toLowerCase();if(!/^\d{10}$/.test(no)||!email||typeof input.requestId!=='string')throw Error('INVALID');
 var rows=wnbRows_(wnbTables_().requests,WNB_HEADERS_).filter(function(r){return r.id===input.requestId&&String(r.businessNumber).replace(/^'/,'')===no&&String(r.email).toLowerCase()===email});if(rows.length!==1)throw Error('NOT_FOUND');var r=rows[0];return{id:r.id,status:r.status,revision:Number(r.revision)};
}
