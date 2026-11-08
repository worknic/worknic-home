import { getStore } from '@netlify/blobs';
import { imageSize } from 'image-size';
import { createHash } from 'node:crypto';
const endpoint='https://script.google.com/macros/s/AKfycbzMH4qy5GOqUsmyNTPOfyk1W2giY1A_ZjUpFsMD3rLAOs4dP4uVDya7bywaIlQOVi8F9g/exec';
const maxBytes=3*1024*1024;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function call(action,payload,token=''){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,payload,token}),signal:AbortSignal.timeout(25000)});const j=await r.json();if(!r.ok||j.ok!==true)throw Object.assign(new Error(j.error||'관리자 인증을 확인해 주세요.'),{status:j.code==='UNAUTHORIZED'?401:502});return j.data;}
export function inspectImage(bytes){const d=imageSize(bytes),mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[d.type];if(!mime||!d.width||!d.height||Math.max(d.width,d.height)>30000||d.width*d.height>50000000)throw new Error('정상적인 PNG/JPG/WebP 사진을 선택해 주세요.');return{mime,width:d.width,height:d.height,orientation:d.orientation||1};}
export async function handle(request,dependencies={}){const api=dependencies.call||call,store=dependencies.store||getStore({name:'worknic-catalog-originals',consistency:'strong'}),url=new URL(request.url),token=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
 try{
 if(request.method==='GET'){
 const id=url.searchParams.get('id')||'';if(!/^[a-f0-9]{64}$/.test(id))return json({ok:false,error:'사진 ID를 확인해 주세요.'},400);
 const visibility=await api('catalog.media',{id});if(!visibility.public){if(!token)return json({ok:false,error:'비공개 사진입니다.'},404);const auth=await api('catalog.authorize',{},token);if(auth.role!=='admin')return json({ok:false,error:'관리자만 확인할 수 있습니다.'},403);}
 const value=await store.getWithMetadata(id,{type:'arrayBuffer'});if(!value)return json({ok:false,error:'사진을 찾을 수 없습니다.'},404);
 return new Response(value.data,{headers:{'Content-Type':value.metadata.mime,'Cache-Control':visibility.public?'public, max-age=300':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Access-Control-Allow-Origin':visibility.public?'https://worknic.co.kr':'https://worknic.tools'}});
 }
 if(request.method!=='POST')return json({ok:false,error:'지원하지 않는 요청입니다.'},405);
 if(request.headers.get('Origin')&&!['https://worknic.tools','https://worknic-tools.netlify.app'].includes(request.headers.get('Origin')))return json({ok:false,error:'워크닉 OS에서 업로드해 주세요.'},403);
 if(!token)return json({ok:false,error:'OS 관리자 로그인이 필요합니다.'},401);const auth=await api('catalog.authorize',{},token);if(auth.role!=='admin')return json({ok:false,error:'관리자 권한이 필요합니다.'},403);
 if(Number(request.headers.get('content-length')||0)>maxBytes*1.4+10000)return json({ok:false,error:'사진은 3MB 이하로 선택해 주세요.'},413);
 const body=await request.json();if(typeof body.base64!=='string'||body.base64.length>Math.ceil(maxBytes/3)*4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64))return json({ok:false,error:'사진 데이터와 용량을 확인해 주세요.'},400);
 const bytes=Buffer.from(body.base64,'base64');if(!bytes.length||bytes.length>maxBytes)return json({ok:false,error:'사진은 3MB 이하로 선택해 주세요.'},413);const info=inspectImage(bytes),id=createHash('sha256').update(bytes).digest('hex');
 // Original bytes are immutable. No resize, background replacement or recolouring.
 await store.set(id,bytes,{metadata:{...info,bytes:bytes.length,sha256:id,uploadedAt:new Date().toISOString(),uploadedBy:auth.actor}});
 return json({ok:true,data:{...info,id,bytes:bytes.length,sha256:id,url:'https://worknic.tools/.netlify/functions/catalog-media?id='+id,originalPixelsPreserved:true}});
 }catch(e){return json({ok:false,error:e.status?e.message:'사진을 처리하지 못했습니다. 파일과 관리자 연결을 확인해 주세요.'},e.status||400);}
}
export default request=>handle(request);
