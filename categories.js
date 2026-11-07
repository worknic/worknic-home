(()=>{'use strict';
const groups=[
 {id:'tools',name:'공구·작업용품',description:'수공구, 전동공구, 측정과 작업 정리',children:[['hand-tools','수공구·전동공구'],['measuring','측정·표시'],['storage','보관·휴대'],['access','사다리·작업대']]},
 {id:'consumables',name:'산업용 소모품·부품',description:'절삭·연마, 체결 부품과 현장 유지보수',children:[['cutting','절삭·연마 소모품'],['fastening','체결·고정 부품'],['machine-parts','기계 부속·교체 부품'],['adhesives','테이프·접착·실링'],['maintenance','윤활·세척·유지보수']]},
 {id:'safety',name:'안전용품',description:'작업자의 보호구와 현장 안전 관리',children:[['gloves','작업장갑·손 보호'],['eyes','보안경·안면 보호'],['respiratory','호흡·청력 보호'],['head-foot','안전모·안전화'],['fall-protection','추락 방지·고소 작업'],['site-safety','현장 표시·안전 시설']]}
];
const ids={cutting:['12635593910','12635591708','13853946102','10683597130','10683185871','10352768362'],fastening:['12873523843','6198021113'],gloves:['8675153104','12771968838']};
const legacy={measuring:['줄자·측정','측정·표시','수평·측정'],storage:['휴대·정리'],access:['사다리·작업대']};
function classify(p){
 const category=String(p.category||'');
 for(const g of groups)for(const [id,label]of g.children){
  if(category===g.name+' / '+label||(ids[id]||[]).includes(String(p.id))||(legacy[id]||[]).includes(category))return {group:g.id,sub:id};
 }
 return {group:'tools',sub:'hand-tools'};
}
function label(group,sub){const g=groups.find(g=>g.id===group);return g?(sub?g.children.find(c=>c[0]===sub)?.[1]||g.name:g.name):'';}
window.WORKNIC_CATEGORIES={groups,classify,label};
})();
