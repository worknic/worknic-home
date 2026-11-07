(()=>{'use strict';
const groups=[
 {id:'tools',name:'공구·작업용품',description:'수공구, 전동공구, 측정과 작업 정리',children:[['hand-tools','수공구·전동공구'],['measuring','측정·표시'],['storage','보관·휴대'],['access','사다리·작업대'],['power-accessories','배터리·충전기']]},
 {id:'consumables',name:'산업용 소모품·부품',description:'절삭·연마, 체결 부품과 현장 유지보수',children:[['cutting','절삭·연마 소모품'],['fastening','체결·고정 부품'],['machine-parts','기계 부속·교체 부품'],['adhesives','테이프·접착·실링'],['maintenance','윤활·세척·유지보수']]},
 {id:'factory',name:'공장소모품',description:'베어링, 오링, 볼트와 동력 전달용 벨트',children:[['bearings','베어링'],['seals','오링·기계용 씰'],['bolts','볼트·너트·와셔'],['belts','V벨트·동력 전달 벨트'],['replacement-parts','기계 부속·교체 부품']]},
 {id:'pneumatics',name:'유공압·에어기계부속',description:'에어 연결 부품, 실린더와 제어 밸브',children:[['fittings','에어피팅·튜브 연결'],['couplers','에어카플러'],['cylinders','에어실린더'],['valves','솔레노이드밸브·공압 제어 밸브']]},
 {id:'safety',name:'안전용품',description:'작업자의 보호구와 현장 안전 관리',children:[['gloves','작업장갑·손 보호'],['eyes','보안경·안면 보호'],['respiratory','호흡·청력 보호'],['head-foot','안전모·안전화'],['fall-protection','추락 방지·고소 작업'],['site-safety','현장 표시·안전 시설']]}
];
const ids={cutting:['12635593910','12635591708','13853946102','10683597130','10683185871','10352768362'],fastening:['12873523843','6198021113'],gloves:['8675153104','12771968838']};
const legacy={measuring:['줄자·측정','측정·표시','수평·측정'],storage:['휴대·정리'],access:['사다리·작업대']};
const handToolCategories=['절단·다듬기','목공 수공구','목공·접합','측정·수공구','체결·가공','플라이어·절단','전설·배선 공구','클램프·고정','라쳇·소켓','작업·측정 공구','토치·가열','타카·체결'];
// Only clear product nouns qualify for automatic import. A tool used on a part
// (e.g. a bearing puller or bolt cutter) is not the part itself.
const noun=(terms)=>new RegExp('(?:^|[\\s·/()])(?:'+terms+')(?=$|[\\s·/(),0-9])','i');
const rules=[
 ['tools','power-accessories',noun('배터리|충전기')],
 ['factory','replacement-parts',noun('카본브러시|카본브러쉬|카본[ -]?브러쉬|콜레트[ -]?너트|스위치[ -]?유니트|LED서킷|LED[ -]?서킷|콜레트[ -]?콘')],
 ['consumables','cutting',noun('해머드릴[ -]?비트|햄머드릴[ -]?비트|해머[ -]?드릴[ -]?비트|드릴비트|드릴[ -]?비트|홀쏘|홀소|직소날|직쏘날|컷쏘날|멀티커터날|치즐|다가네|샌딩페이퍼')],
 ['tools','hand-tools',noun('충전드릴|무선드릴|해머드릴|햄머드릴|로타리해머|충전드라이버|임팩트렌치|임팩트[ -]?렌치|체인톱|원형톱|각도절단기|슬라이딩[ -]?각도절단기|멀티커터|컷쏘|직소기|루터|트리머|전기대패|충전대패|집진기|청소기|열풍기|그라인더|샌더|송풍기|콤프레샤')],
 ['factory','bearings',noun('베어링|bearing(?:s)?')],['factory','seals',noun('오링|오 링|O[ -]?링|O[ -]?RING')],
 ['factory','bolts',noun('볼트|너트|와셔|육각볼트|육각너트|평와셔|스프링와셔')],['factory','belts',noun('V[ -]?(?:벨트|BELT)|브이벨트|브이 벨트')],
 ['pneumatics','fittings',noun('에어[ -]?(?:피팅|휘팅|휘팅류|피팅류)|공압[ -]?피팅')],['pneumatics','couplers',noun('에어[ -]?(?:카플러|커플러|커플링)|공압[ -]?커플러')],
 ['pneumatics','cylinders',noun('에어[ -]?실린더|공압[ -]?실린더')],['pneumatics','valves',noun('솔레노이드[ -]?밸브|솔레노이드밸브|공압[ -]?제어[ -]?밸브')],
 ['tools','measuring',noun('줄자|수평기|분도기')],['tools','storage',noun('시스테이너[³3]?|공구함|공구[ -]?파우치|툴[ -]?벨트|소켓[ -]?레일')],
 ['tools','access',noun('사다리|작업대')],['tools','hand-tools',noun('임팩트[ -]?드라이버|전동드릴|펜치|플라이어|래칫[ -]?렌치|라쳇[ -]?렌치|커터칼|구두칼|목공[ -]?끌|토치|타카|클램프|볼트[ -]?커터|베어링[ -]?풀러')],
 ['consumables','cutting',noun('원형톱날|톱날|샌딩블럭|샌딩블록|절단[ -]?(?:휠|석)')],['consumables','fastening',noun('타카핀')],['consumables','adhesives',noun('포장테이프|마스킹테이프|실리콘[ -]?실란트')],
 ['safety','gloves',noun('작업장갑|방한장갑|작업[ -]?장갑|방한[ -]?장갑')]
];
function explicit(category){for(const g of groups)for(const [sub,label]of g.children)if(category===g.name+' / '+label)return {group:g.id,sub};return null;}
function infer(p){const name=String(p.name||'');const hits=rules.filter(([group,,pattern])=>pattern.test(name)&&!(group==='factory'&&/(풀러|분리기|압입기|볼트[ -]?커터|벨트[ -]?풀리)/i.test(name)));if(hits.length&&hits.every(r=>r[0]==='tools'&&r[1]==='hand-tools')&&/비트|톱날|커터날|패드|필터|필타|집진백|호스|노즐|어태치먼트|어태치|스위치|브러시|브러쉬|부품/.test(name))return null;const unique=hits.filter((r,i,a)=>a.findIndex(x=>x[0]===r[0]&&x[1]===r[1])===i);if(unique.length===1)return {group:unique[0][0],sub:unique[0][1]};const part=unique.find(r=>r[0]==='consumables'&&r[1]==='cutting')||unique.find(r=>r[0]==='factory'&&r[1]==='replacement-parts');if(part&&unique.every(r=>r===part||(r[0]==='tools'&&r[1]==='hand-tools')))return {group:part[0],sub:part[1]};return null;}
function classifyCandidate(p){return explicit(String(p.category||''))||infer(p);}
function classify(p){
 const category=String(p.category||'');
 const exact=explicit(category);if(exact)return exact;
 for(const g of groups)for(const [id,label]of g.children){
  if(category===g.name+' / '+label||(ids[id]||[]).includes(String(p.id))||(legacy[id]||[]).includes(category))return {group:g.id,sub:id};
 }
 if(handToolCategories.includes(category))return {group:'tools',sub:'hand-tools'};
 return infer(p)||{group:'unclassified',sub:''};
}
function label(group,sub){const g=groups.find(g=>g.id===group);return g?(sub?g.children.find(c=>c[0]===sub)?.[1]||g.name:g.name):'';}
function categoryValue(result){const g=groups.find(g=>g.id===result?.group),child=g?.children.find(c=>c[0]===result.sub);return child?g.name+' / '+child[1]:'';}
window.WORKNIC_CATEGORIES={groups,classify,classifyCandidate,categoryValue,label};
})();
