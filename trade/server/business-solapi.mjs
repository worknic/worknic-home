import {createHmac,randomBytes} from 'node:crypto';
export function createExistingOSBusinessSms(os,{allowSend=false}={}){
 return {send(input){if(!allowSend)throw Error('Live sending disabled');return os.businessSms({...input,operation:'send'})},status(messageId,context){return os.businessSms({...context,messageId,operation:'status'})}};
}
// Reuse the existing WORKNIC Service OS credentials; never prints or persists them.
export function createBusinessSolapi({key,secret,from,fetcher=fetch,clock=()=>new Date(),allowSend=false}={}){
 if(!key||!secret||!/^\d{8,15}$/.test(from||''))throw Error('Existing SOLAPI account configuration required');
 async function request(path,body){
  const date=clock().toISOString(),salt=randomBytes(16).toString('hex'),signature=createHmac('sha256',secret).update(date+salt).digest('hex');
  const r=await fetcher('https://api.solapi.com'+path,{method:body?'POST':'GET',headers:{Authorization:`HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
  let data;try{data=await r.json()}catch{return {status:r.status,data:null}}return {status:r.status,data};
 }
 const classify=code=>code==='4000'?'delivered':code==='5000'?'failed':['2000','3000'].includes(code)?'accepted':/^(?:1\d{3}|2\d{3}|3\d{3})$/.test(code||'')?'failed':'unknown';
 return {
  async send({to,text,eventKey}){
   if(!allowSend)throw Error('Live sending disabled');
   if(!/^010\d{8}$/.test(to||'')||typeof text!=='string'||text.length>900||typeof eventKey!=='string')throw Error('Message scope invalid');
   const r=await request('/messages/v4/send-many/detail',{messages:[{to,from,text,type:'LMS',subject:'WORKNIC ����� �ȳ�',customFields:{worknicBusinessEvent:eventKey}}],allowDuplicates:false,showMessageList:true});
   if(r.status>=400)return {status:r.status<500?'failed':'unknown',code:String(r.status)};
   const failed=r.data?.failedMessageList?.[0];if(failed)return {status:'failed',messageId:failed.messageId,code:String(failed.statusCode||'')};
   const m=r.data?.messageList?.[0];if(!m?.messageId)return {status:'unknown'};
   return {status:classify(String(m.statusCode)),messageId:m.messageId,code:String(m.statusCode)};
  },
  async status(messageId){
   if(!/^[a-zA-Z0-9_-]{10,100}$/.test(messageId||''))throw Error('Provider message ID invalid');
   const r=await request('/messages/v4/list?criteria=messageId&cond=eq&value='+encodeURIComponent(messageId)+'&limit=1');
   if(r.status!==200)throw Error('Provider lookup unavailable');
   const m=r.data?.messageList?.[messageId];if(!m||m.messageId!==messageId)return {status:'unknown'};
   return {status:classify(String(m.statusCode)),code:String(m.statusCode)};
  },
 };
}
