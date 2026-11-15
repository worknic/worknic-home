import {el,field,formTask,card,call,button,say} from './beta-common.js';
export function businessEnrollmentAdmin(root){
 const c=card('�̹� ���ε� ���� �� ���� ���� �ȳ�'),form=el('form');
 c.append(el('p','���� OS ��û�� �ٽ� �ۼ����� �ʰ� �����մϴ�. OS�� ��Ȯ�� ��û��ȣ�� ����ó�� Ȯ���ؾ� �ϸ�, ����ڹ�ȣ������ ������ �ο����� �ʽ��ϴ�.'));
 field(form,'requestId','OS ��û��ȣ');field(form,'businessNumber','����ڵ�Ϲ�ȣ');field(form,'email','��û ����� �̸���');field(form,'contactVerified','��û ������ ���� ����� ����ó�� Ȯ���߽��ϴ�.',false,'checkbox').required=true;
 let requestKey=crypto.randomUUID();const result=el('div');form.append(el('button','���� ���� �ȳ� �غ�','button'));formTask(form,async data=>{await call('/admin/enrollment/import',{requestId:data.requestId,profile:{businessNumber:data.businessNumber.replace(/[-\s]/g,''),email:data.email},contactVerified:true,requestKey});say('���� ���� ��û�� �����ϰ� �ȳ� ��⸦ ����߽��ϴ�. ���� ���������� ���¸� ���� Ȯ�����ּ���.');await refresh(data.requestId)});
 async function refresh(requestId){const d=await call('/admin/enrollment/messages',{requestId});result.replaceChildren();const labels={queued:'�߼� ���',submitting:'���� ��û ��',accepted:'�߼� ������ �� ���� Ȯ�� ��',delivered:'���� �Ϸ�',failed:'����',unknown:'��� �Ҹ� �� �ڵ� ��߼� �� ��',cancelled:'���� �������� ��ҵ�'};for(const m of d.messages){const row=el('div');row.append(el('p',(m.kind==='received'?'��û �ȳ�':'���� �ȳ�')+' �� '+(labels[m.status]||m.status)));if(m.provider_id&&!['delivered','failed','cancelled'].includes(m.status))row.append(button('���� ��� ��ȸ',async()=>{await call('/admin/enrollment/refresh-message',{eventKey:m.event_key});await refresh(requestId)},'button secondary'));result.append(row)}if(!d.messages.length)result.append(el('p','���� ����� �����ϴ�.'))}
 let reissueRequest=null;
 form.append(button('�ȳ� ���� Ȯ��',async()=>{const id=form.elements.requestId.value.trim();if(!id)throw Error('OS ��û��ȣ�� �Է����ּ���.');await refresh(id)},'button secondary'));
 form.append(button('���� ���� ��ũ �ٽ� �ȳ�',async()=>{
  const id=form.elements.requestId.value.trim();if(!id||!form.elements.contactVerified.checked)throw Error('��û��ȣ�� ���� ����� ����ó�� �ٽ� Ȯ�����ּ���.');
  if(!confirm('���� ���� ���� ��ũ�� ����ǰ� �� �ȳ� ���ڰ� �غ�˴ϴ�. Ȯ���� ����ڿ��� �ٽ� �ȳ��ұ��?'))return;
  if(reissueRequest?.id!==id)reissueRequest={id,key:crypto.randomUUID()};
  await call('/admin/enrollment/reissue',{requestId:id,contactVerified:true,requestKey:reissueRequest.key});
  reissueRequest=null;say('�� ���� ���� �ȳ��� �غ��߽��ϴ�. ���� ���� ���¸� Ȯ�����ּ���.');await refresh(id);
 },'button secondary'));
 c.append(form,result);root.append(c);
}
