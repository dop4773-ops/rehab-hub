// verifyall.js — 교차검증 「전체 검증」 본체(runAllVerifications): 개수·위치·치료사·인수인계·평가메인·PTA 대조를 차례로 돌려 불일치 목록을 만든다.
// 교차검증 화면(core내장 HTML)에 있던 함수를 옮긴 것(계산 로직 변경 없음). 화면과 닿는 곳은 전부 hooks로만 한다:
//   deps  = 읽기만 하는 값·함수(state의 엑셀 묶음, 파서, 비교 함수, BUMPS)
//   hooks = { waitHandover(), begin(), step(id, cls), set(name, value), publish(stats) } — 화면이 미리보기·요약에 쓰는 값을 받는다
// 브라우저: <script src="../core/verifyall.js"> → RehabCore.verifyAll.run(deps, hooks) / Node: require() (테스트용)
'use strict';
(function (root) {
async function run(deps, hooks) {
  const { state, normKey, regDigits, roomDigits, pickOriginalTableSheet, pickOriginalMatSheet, parsePatientCards, countLocationChecks, compareFloor, buildSchedTherapistIndex, buildLocationIssue, collectGridEntries, parseStatusSheet, parseSaturdayScheduleSheet, parsePtaSheet, parseHandoverSheet, parseEvalMainOccurrences, parseEvalMainNames, normDoctor, collectFieldOccurrences, buildScheduleLocationIssue, buildScheduleLocationChecks, buildScheduleData, buildSaturdayLocationIssue, buildSaturdayLocationChecks, buildOutpatientActual, buildHandoverTherapistChecks, buildHandoverIndex, buildHandoverExcessChecks, buildDoctorChecks, buildActualCounts, attachRefs, BUMPS } = deps;
  await hooks.waitHandover(); // 실시간 인수인계 조회가 끝날 때까지 기다려서, 타이밍에 따라 인식이 됐다 안 됐다 하지 않게 한다
  hooks.begin();
  let previewDischarged, previewWeekdayErdt, previewStore, previewCards, previewSaturday, crossSkipNotes, crossInputs; // 화면(미리보기·요약)이 읽는 값 — 만들 때마다 hooks.set으로 화면에 넘긴다
  hooks.step('stepCount',''); hooks.step('stepLoc',''); hooks.step('stepTher','');
  const allIssues=[];
  let countChecked=0, countProblems=0, locChecked=0, locProblems=0, therChecked=0, therProblems=0, handoverChecked=0, handoverProblems=0, evalChecked=0, evalProblems=0, roomChecked=0, roomProblems=0;
  const floorCount={10:0,3:0};
  // 제외 기능이 불일치 하나를 빼도 대시보드 숫자가 맞도록, 불일치를 만들 때마다 그 직전까지 올라간 문제 건수·층 건수를 적어 둔다
  const readBump=()=>({count:countProblems, location:locProblems, therapist:therProblems, handover:handoverProblems, eval:evalProblems, room:roomProblems, f10:floorCount[10], f3:floorCount[3]});
  let lastBump=readBump();
  const rawPush=allIssues.push.bind(allIssues);
  allIssues.push=(...xs)=>{ for(const x of xs){ const cur=readBump(), d={}; for(const k in cur) d[k]=cur[k]-lastBump[k]; BUMPS.set(x,d); lastBump=cur; } return rawPush(...xs); };

  let sched=null, status=null, actual=null;
  let cardsByFloor={10:[], 3:[]};
  let cardIndex={10:new Map(), 3:new Map()};

  // 카드 파일 먼저 파싱 (위치·치료사 단계에서 공용으로 사용)
  if(state.card10Book){ cardsByFloor[10]=await parsePatientCards(state.card10Book, 10); cardsByFloor[10].forEach(c=>{ if(!cardIndex[10].has(normKey(c.name))) cardIndex[10].set(normKey(c.name), c); }); }
  if(state.card3Book){ cardsByFloor[3]=await parsePatientCards(state.card3Book, 3); cardsByFloor[3].forEach(c=>{ if(!cardIndex[3].has(normKey(c.name))) cardIndex[3].set(normKey(c.name), c); }); }
  function findCard(name, floor){ return (floor && cardIndex[floor] && cardIndex[floor].get(normKey(name))) || cardIndex[10].get(normKey(name)) || cardIndex[3].get(normKey(name)) || null; }
  hooks.set('cardFinder', findCard); // 상세 패널의 "전체시간표 카드(엑셀 그대로)"가 같은 카드를 찾는 데 쓴다
  let scheduleFloorByName=new Map(); // 평일시간표(원본)의 "팀 구분"(1·2팀=10F, 3팀=3F)에서 얻은 환자별 층 정보 — 카드 파일이 없어도 층을 판정할 수 있게 하는 보조 자료
  function floorOfPatient(name, fallbackFloor){
    if(cardIndex[10].has(normKey(name))) return 10;
    if(cardIndex[3].has(normKey(name))) return 3;
    const sf=scheduleFloorByName.get(normKey(name));
    if(sf) return sf;
    return fallbackFloor || null;
  }

  // 현황판이 "퇴원"(또는 특이사항에 전원 표기)으로 보는 환자가 시간표 원본에 아직 남아 있는지 — 시트마다 환자 1명당 1건으로 묶어서 알린다.
  // (퇴원 후 다시 입원/외래 줄이 있는 이름은 현재도 다니는 환자라 제외한다)
  const dischargeTargets=new Map();
  const residueLabel={sot:'SOT',rdt:'RDT',erdt:'ERDT',ccrt:'CCRT'};
  function checkScheduleResidue(sheetLabel, ents){
    const byKey=new Map();
    for(const e of ents){ const k=normKey(e.name); if(!byKey.has(k)) byKey.set(k,{name:e.name,items:[]}); byKey.get(k).items.push(e); }
    for(const [k,g] of byKey){
      countChecked++;
      const t=dischargeTargets.get(k); if(!t) continue;
      countProblems++;
      const fl=floorOfPatient(g.name, null); if(fl) floorCount[fl]++;
      const counts={}; g.items.forEach(e=>{ const l=residueLabel[e.type]||e.type||'치료'; counts[l]=(counts[l]||0)+1; });
      const summary=Object.entries(counts).map(([l,n])=>`${l} ${n}건`).join(' · ');
      const word=t.kind==='discharged'?'퇴원':'전원 표기';
      allIssues.push({
        id:'dissched-'+allIssues.length, category:'count', field:'discharge', floor:fl,
        patient:g.name, room:t.room,
        title:`${word} 후 ${sheetLabel} 잔존`,
        line:`현황판은 ${word}인데 ${sheetLabel}에 ${summary}이 남아있어요`,
        time:'', searchText:normKey(`${g.name} ${t.room} ${sheetLabel}`),
        severityRank:0,
        detail:{kind:'discharge_in_sched', patient:g.name, room:t.room, sheet:sheetLabel, word, entries:g.items.map(e=>({time:e.time||'', type:residueLabel[e.type]||e.type||'', therapist:e.therapist||''}))}
      });
    }
  }

  // ---- ① 개수 비교 ----
  hooks.step('stepCount','now');
  previewDischarged=new Set(); hooks.set('previewDischarged', previewDischarged);
  if(state.statusBook){
    status=await parseStatusSheet(state.statusBook); hooks.set('statusSheetName', status.sheetName);
    sched=await buildScheduleData(state.statusBook);
    actual=buildActualCounts(sched);
    previewWeekdayErdt={erdt: sched.erdt, ccrt: sched.ccrt}; hooks.set('previewWeekdayErdt', previewWeekdayErdt);
    previewDischarged = new Set(status.dischargedList.map(r=>normKey(r.name))); hooks.set('previewDischarged', previewDischarged);
    { const activeKeys=new Set(status.list.map(r=>normKey(r.name)));
      for(const r of status.dischargedList){ const k=normKey(r.name); if(!activeKeys.has(k)&&!dischargeTargets.has(k)) dischargeTargets.set(k,{name:r.name,room:r.room,kind:'discharged'}); }
      for(const r of status.list){ if((r.admit==='입원'||r.admit==='재입원')&&r.transfer) dischargeTargets.set(normKey(r.name),{name:r.name,room:r.room,kind:'transfer'}); } }
    // "평일시간표(원본)"은 1팀·2팀=10층, 3팀=3층으로 나뉘어 있고, 이미 각 배정 건에 floor가 태깅되어 있다.
    // 이걸 환자명 → 층 지도로 만들어 두면, 전체시간표(원본) 카드 파일이 없어도 개수 불일치의 층을 판정할 수 있다.
    for(const o of sched.occ){ if(!scheduleFloorByName.has(normKey(o.name))) scheduleFloorByName.set(normKey(o.name), o.floor); }
    for(const e of sched.erdt){ if(!scheduleFloorByName.has(normKey(e.name))) scheduleFloorByName.set(normKey(e.name), e.floor); }
    for(const c2 of sched.ccrt){ if(!scheduleFloorByName.has(normKey(c2.name))) scheduleFloorByName.set(normKey(c2.name), c2.floor); }
    const fieldNames={sot:'SOT',rdt:'RDT',erdt:'ERDT',ccrt:'CCRT'};
    for(const rec of status.list){
      const isOutp = rec.admit==='외래';
      if(isOutp){
        // 외래 환자: "평일시간표(원본)"엔 나오지 않으므로, 전체시간표(원본)의 "외래" 카드 요일칸에
        // 해당 치료 문구가 있는지(있음/없음)로 확인한다 — 입원 환자처럼 정확한 횟수 비교는 하지 않는다.
        const card=findCard(rec.name);
        const oa=buildOutpatientActual(card);
        const fl=card ? card.floor : floorOfPatient(rec.name, null);
        const outpTherapistLabel={sot:'작업치료', rdt:'연하치료', erdt:'', ccrt:'인지치료'};
        const outpEntries={sot:'sotWeekdayEntries', rdt:'rdtWeekdayEntries', erdt:'erdtWeekdayEntries', ccrt:'cogWeekdayEntries'};
        for(const key of ['sot','rdt','erdt','ccrt']){
          countChecked++;
          const expected=rec[key]>0, actualFound=!!oa[key];
          if(expected!==actualFound){
            countProblems++;
            if(fl) floorCount[fl]++;
            const lbl=outpTherapistLabel[key];
            const therapistNames=(lbl && card && card.therapists[lbl]) ? card.therapists[lbl].join(' / ') : '';
            const dayEntries=(card ? (card[outpEntries[key]]||[]) : []);
            allIssues.push({
              id:'count-'+allIssues.length, category:'count', field:key, floor:fl,
              patient:rec.name, room:rec.room,
              title:`${fieldNames[key]} 외래 확인 필요`,
              line: actualFound ? `현황엔 없음 → 외래 카드엔 ${fieldNames[key]} 일정이 있어요` : `현황 ${rec[key]}회 → 외래 카드에서 못 찾았어요`,
              time:'', searchText:normKey(rec.name+' '+rec.room+' '+fieldNames[key]),
              severityRank:1,
              detail:{kind:'count', field:fieldNames[key], expected:rec[key], actual:actualFound?'외래 카드에 있음':'외래 카드에 없음', room:rec.room, occurrences:[], source:'outpatient', hasCard:!!card, therapist:therapistNames, dayEntries}
            });
          }
        }
      } else {
      const a=actual.get(normKey(rec.name)) || {sot:0,rdt:0,erdt:0,ccrt:0};
      for(const key of ['sot','rdt','erdt','ccrt']){
        countChecked++;
        if(rec[key]!==a[key]){
          countProblems++;
          const diff=a[key]-rec[key];
          const fl=floorOfPatient(rec.name, null);
          if(fl) floorCount[fl]++;
          const occurrences=collectFieldOccurrences(sched, rec.name, key);
          allIssues.push({
            id:'count-'+allIssues.length, category:'count', field:key, floor:fl,
            patient:rec.name, room:rec.room,
            title:`${fieldNames[key]} 횟수 불일치`,
            line:`현황 ${rec[key]}회 → 실제 ${a[key]}회`,
            time:'', searchText:normKey(rec.name+' '+rec.room+' '+fieldNames[key]),
            severityRank:Math.abs(diff),
            detail:{kind:'count', field:fieldNames[key], expected:rec[key], actual:a[key], diff, room:rec.room, occurrences}
          });
        }
      }
      }
      // 언어치료는 평일시간표(원본)이 아니라 전체시간표(원본) 카드에서 집계한다.
      // 카드 자체를 찾지 못하면(판정 불가) 통계에 넣지 않는다 — ③ 치료사 매칭과 동일한 원칙.
      if(status.hasLang){
        const card=findCard(rec.name);
        if(card){
          countChecked++;
          const actualLang=card.langCount||0;
          if(rec.lang!==actualLang){
            countProblems++;
            const diff=actualLang-rec.lang;
            const fl=floorOfPatient(rec.name, card.floor);
            if(fl) floorCount[fl]++;
            const occurrences=(card.langOccurrences||[]).map(o=>({time:o.time, therapist:'', extra:o.day+'요일'}));
            allIssues.push({
              id:'count-'+allIssues.length, category:'count', field:'lang', floor:fl,
              patient:rec.name, room:rec.room,
              title:'언어 횟수 불일치',
              line:`현황 ${rec.lang}회 → 실제 ${actualLang}회`,
              time:'', searchText:normKey(rec.name+' '+rec.room+' 언어'),
              severityRank:Math.abs(diff),
              detail:{kind:'count', field:'언어', expected:rec.lang, actual:actualLang, diff, room:rec.room, occurrences, source:'card'}
            });
          }
        }
      }
    }
    // ---- ①-1.4 퇴원/전원 표기 vs 평일시간표(원본) (SOT/RDT/ERDT — CCRT는 아래 기존 규칙이 확인, 전체시간표 파일이 없을 때만 여기서 함께 확인) ----
    checkScheduleResidue('평일시간표(원본)', [
      ...sched.occ.map(o=>({name:o.name,type:o.type,time:o.time,therapist:o.therapist})),
      ...sched.erdt.map(e=>({name:e.name,type:'erdt',time:e.time,therapist:e.therapist})),
      ...((state.card10Book||state.card3Book)?[]:sched.ccrt.map(c=>({name:c.name,type:'ccrt',time:`${c.day} ${c.time}`,therapist:c.therapist}))),
    ]);
    // ---- ①-1.5 인지치료(CCRT/BETTER/COMCOG 통합) 미리보기 기반 문제 목록에도 반영 ----
    if(state.card10Book || state.card3Book){
      const ccrtCardByName=new Map([...(cardsByFloor[10]||[]), ...(cardsByFloor[3]||[])].map(c=>[normKey(c.name),c]));
      for(const c of sched.ccrt){
        countChecked++;
        const key=normKey(c.name);
        const card=ccrtCardByName.get(key);
        let bad=false, kind='', line='';
        if(previewDischarged.has(key)){
          bad=true; kind='ccrt_discharged';
          line=`퇴원 처리된 환자인데 인지치료 배정이 아직 남아있어요`;
        } else if(!card){
          bad=true; kind='ccrt_noname';
          line=`전체시간표(원본)에서 이 환자 카드를 찾지 못했어요`;
        } else {
          const ok=(card.cogWeekdayEntries||[]).some(x=>x.time===c.timeKey && x.day===c.day);
          if(!ok){ bad=true; kind='ccrt_daymismatch'; line=`전체시간표(원본) 요일칸에 인지치료로 표시되어 있지 않아요`; }
        }
        if(bad){
          countProblems++;
          const fl=c.floor || floorOfPatient(c.name, null); if(fl) floorCount[fl]++;
          allIssues.push({
            id:'ccrt-'+allIssues.length, category:'count', field: kind==='ccrt_discharged'?'discharge':'ccrt', floor:fl,
            patient:c.name, room:card?card.room:'',
            title: kind==='ccrt_discharged' ? '퇴원 후 인지치료 잔존' : kind==='ccrt_noname' ? '인지치료 카드 못 찾음' : '인지치료 요일 불일치',
            line, time:c.time, searchText:normKey(`${c.name} ${c.day} ${c.time}`),
            severityRank:0,
            detail:{kind:'ccrt_issue', patient:c.name, day:c.day, time:c.time, therapist:c.therapist, verdict:line}
          });
        }
      }
    }
    // ---- ①-2 퇴원 동기화 확인(양방향): 현황(회복기) 활성/퇴원 명단 vs 전체시간표(원본) 카드 존재 여부 ----
    if(state.card10Book || state.card3Book){
      for(const rec of status.list){
        countChecked++;
        const card=findCard(rec.name);
        if(!card){
          countProblems++;
          allIssues.push({
            id:'discharge-'+allIssues.length, category:'count', field:'discharge', floor:null,
            patient:rec.name, room:rec.room,
            title:'퇴원처리 누락',
            line:`전체시간표(원본)에 카드가 없어요 · 퇴원 처리 필요로 보여요`,
            time:'', searchText:normKey(`${rec.name} ${rec.room}`),
            severityRank:0,
            detail:{kind:'discharge_notmarked', patient:rec.name, room:rec.room}
          });
        }
      }
      for(const rec of status.dischargedList){
        countChecked++;
        const card=findCard(rec.name);
        // 퇴원 후에도 외래로 계속 다니는 경우 "외래" 카드가 남아있는 건 정상이므로(카드 정리 대상 아님),
        // 입원(입원/7병동) 카드가 남아있을 때만 문제로 본다.
        if(card && !card.isOutpatient){
          countProblems++;
          allIssues.push({
            id:'discharge-'+allIssues.length, category:'count', field:'discharge', floor:card.floor,
            patient:rec.name, room:card.room||rec.room,
            title:'퇴원 후 카드 잔존',
            line:`전체시간표(원본)에 카드가 아직 남아있어요 · 카드 정리 필요`,
            time:'', searchText:normKey(`${rec.name} ${rec.room}`),
            severityRank:0,
            detail:{kind:'discharge_stillactive', patient:rec.name, room:card.room||rec.room, floor:card.floor}
          });
        }
      }
      // 반대 방향: 입원 카드는 있는데 현황판에 이름이 없음(퇴원 행도 없음) — 신환 등록 누락일 수 있다.
      { const inStatus=new Set(status.list.concat(status.dischargedList).map(r=>normKey(r.name))), seenCard=new Set();
        for(const fl of [10,3]) for(const c of cardsByFloor[fl]){
          if(c.isOutpatient) continue;
          const k=normKey(c.name); if(seenCard.has(k)) continue; seenCard.add(k);
          countChecked++;
          if(inStatus.has(k)) continue;
          countProblems++; floorCount[fl]++;
          allIssues.push({
            id:'discharge-'+allIssues.length, category:'count', field:'discharge', floor:fl,
            patient:c.name, room:c.room,
            title:'현황판에 없는 입원 카드',
            line:`전체시간표(원본)엔 카드가 있는데 현황판엔 이름이 없어요 · 신환 등록 누락 확인 필요`,
            time:'', searchText:normKey(`${c.name} ${c.room}`),
            severityRank:0,
            detail:{kind:'card_nostatus', patient:c.name, room:c.room, floor:fl}
          });
        } }
      // 외래 카드도 같은 방향으로: 외래 카드는 있는데 현황판에 이름이 없음(퇴원 행·외래 행 어느 쪽에도). 퇴원 후 외래로 다니는 환자는 현황판에 "퇴원"으로 남아 있어 정상이다.
      { const inStatus=new Set(status.list.concat(status.dischargedList).map(r=>normKey(r.name))), seenCard=new Set();
        for(const fl of [10,3]) for(const c of cardsByFloor[fl]){
          if(!c.isOutpatient) continue;
          const k=normKey(c.name); if(seenCard.has(k)) continue; seenCard.add(k);
          countChecked++;
          if(inStatus.has(k)) continue;
          countProblems++; floorCount[fl]++;
          allIssues.push({
            id:'discharge-'+allIssues.length, category:'count', field:'discharge', floor:fl,
            patient:c.name, room:c.room,
            title:'현황판에 없는 외래 카드',
            line:`전체시간표(원본) 외래 카드는 있는데 현황판엔 이름이 없어요 · 외래 등록 누락 확인 필요`,
            time:'', searchText:normKey(`${c.name} ${c.room}`),
            severityRank:0,
            detail:{kind:'card_nostatus', outpatient:true, patient:c.name, room:c.room, floor:fl}
          });
        } }
    }
    // ---- ①-2 볼드체 대조: 평일시간표(원본)에서 볼드로 표시된 환자 vs "평가메인" 시트 명단 ----
    const evalNames = await parseEvalMainNames(state.statusBook);
    if(evalNames){
      const boldByKey=new Map(); // normKey -> 대표 이름(표시용)
      for(const o of sched.occ){ if(o.bold && !boldByKey.has(normKey(o.name))) boldByKey.set(normKey(o.name), o.name); }
      for(const [key, name] of boldByKey){
        evalChecked++;
        if(!evalNames.has(key)){
          evalProblems++;
          const fl=floorOfPatient(name, null); if(fl) floorCount[fl]++;
          allIssues.push({
            id:'eval-'+allIssues.length, category:'eval', source:'missing', floor:fl,
            patient:name, room:'',
            title:'볼드 환자가 평가메인에 없음',
            line:`평일시간표(원본)엔 볼드로 표시돼 있는데, "평가메인" 시트엔 없어요`,
            time:'', searchText:normKey(name),
            severityRank:0,
            detail:{kind:'eval_missing', patient:name}
          });
        }
      }
      for(const key of evalNames){
        evalChecked++;
        if(!boldByKey.has(key)){
          evalProblems++;
          const rec = status.list.find(r=>normKey(r.name)===key);
          const dispName = rec ? rec.name : key;
          const fl=floorOfPatient(dispName, null); if(fl) floorCount[fl]++;
          allIssues.push({
            id:'eval-'+allIssues.length, category:'eval', source:'extra', floor:fl,
            patient:dispName, room:rec?rec.room:'',
            title:'평가메인엔 있는데 볼드가 아님',
            line:`"평가메인" 시트엔 있는데, 평일시간표(원본)엔 이 환자가 볼드로 표시돼 있지 않아요`,
            time:'', searchText:normKey(dispName),
            severityRank:0,
            detail:{kind:'eval_extra', patient:dispName}
          });
        }
      }
      // ---- ①-3 평가메인 이름 중복: 같은 이름이 평가메인에 두 번 이상 나오는 경우(볼드 기준과는 별개의 항목) ----
      // 환자 식별 정보가 이름뿐이라 "같은 사람이 두 번 적힘"인지 "동명이인"인지는 현황판에 같은 이름이 몇 명 있는지로만 알려준다(판정은 사람이).
      const evalOcc=await parseEvalMainOccurrences(state.statusBook);
      if(evalOcc){
        const byName=new Map();
        for(const o of evalOcc){ const k=normKey(o.name); if(!byName.has(k)) byName.set(k,{name:o.name,items:[]}); byName.get(k).items.push(o); }
        for(const [k,g] of byName){
          evalChecked++;
          if(g.items.length<2) continue;
          evalProblems++;
          const sameNameInStatus=status.list.filter(r=>normKey(r.name)===k).length;
          const fl=floorOfPatient(g.name, null); if(fl) floorCount[fl]++;
          const where=g.items.map(o=>`${o.time||'?'}${o.therapist?'·'+o.therapist:''}`).join(' / ');
          allIssues.push({
            id:'eval-'+allIssues.length, category:'eval', source:'dup', floor:fl,
            patient:g.name, room:(status.list.find(r=>normKey(r.name)===k)||{}).room||'',
            title:'평가메인 이름 중복',
            line:`평가메인에 같은 이름이 ${g.items.length}번 나와요 (${where})`,
            time:'', searchText:normKey(g.name),
            severityRank:g.items.length,
            detail:{kind:'eval_dup', patient:g.name, count:g.items.length, places:g.items.map(o=>({time:o.time||'', therapist:o.therapist||''})), sameNameInStatus}
          });
        }
      }
      // ---- ①-4 평가 누락(현황판 기준): 현황판에서 입원/재입원인 환자가 평가메인에 없는 경우 — 볼드 기준(위)과는 별도로 표시 ----
      for(const rec of status.list){
        if(rec.admit!=='입원' && rec.admit!=='재입원') continue;
        evalChecked++;
        if(evalNames.has(normKey(rec.name))) continue;
        evalProblems++;
        const fl=floorOfPatient(rec.name, null); if(fl) floorCount[fl]++;
        allIssues.push({
          id:'eval-'+allIssues.length, category:'eval', source:'noeval', floor:fl,
          patient:rec.name, room:rec.room,
          title:`평가메인 누락 (현황판 ${rec.admit})`,
          line:`현황판엔 ${rec.admit} 환자인데 "평가메인" 시트엔 이름이 없어요`,
          time:'', searchText:normKey(`${rec.name} ${rec.room}`),
          severityRank:0,
          detail:{kind:'eval_noeval', patient:rec.name, room:rec.room, admit:rec.admit}
        });
      }
    }
  }
  hooks.step('stepCount','done');

  // ---- ①-5 PTA 재원현황 기준 병실 대조: 병실의 기준값은 PTA 재원현황 — 현황판·전체시간표 카드의 병실을 그 값과 비교한다 ----
  let ptaMapAll=null; const ptaCandByKey=new Map(); // ⑤ 주치의(RM) 대조가 PTA에서 고른 후보를 다시 쓴다
  if(state.ptaBook){
    let ptaMap=null;
    try{ ptaMap=await parsePtaSheet(state.ptaBook); }catch(e){ console.error(e); }
    if(ptaMap){
      ptaMapAll=ptaMap;
      const people=new Map(); // normKey → {name, statusRoom, cardRoom, cardReg}
      const slot=(name)=>{ const k=normKey(name); if(!people.has(k)) people.set(k,{name,statusRoom:'',cardRoom:'',cardReg:''}); return people.get(k); };
      if(status) for(const r of status.list){ if(r.admit==='입원'||r.admit==='재입원') slot(r.name).statusRoom=r.room; }
      for(const fl of [10,3]) for(const c of cardsByFloor[fl]){ if(c.isOutpatient) continue; const p=slot(c.name); if(!p.cardRoom){ p.cardRoom=c.room; p.cardReg=c.reg; } }
      for(const [k,p] of people){
        roomChecked++;
        const cands=ptaMap.get(k)||[];
        const fl=floorOfPatient(p.name, null);
        if(!cands.length){
          roomProblems++; if(fl) floorCount[fl]++;
          allIssues.push({
            id:'room-'+allIssues.length, category:'room', source:'nopta', floor:fl,
            patient:p.name, room:p.statusRoom||p.cardRoom,
            title:'PTA 재원현황에서 환자를 찾지 못함',
            line:'매칭 불가 — 퇴원·전원했거나 이름 표기가 달라서일 수 있어요(확인 필요)',
            time:'', searchText:normKey(`${p.name} ${p.statusRoom} ${p.cardRoom}`), severityRank:0,
            detail:{kind:'room_nopta', patient:p.name, statusRoom:p.statusRoom, cardRoom:p.cardRoom}
          });
          continue;
        }
        const sRoom=roomDigits(p.statusRoom), cRoom=roomDigits(p.cardRoom);
        // 같은 이름이 PTA에 여러 명(서로 다른 병록#)이면 카드 등록번호 → 같은 병실이 있는 사람 순으로 골라서 비교한다.
        const byReg=cands.length>1&&regDigits(p.cardReg)?cands.find(c=>regDigits(c.reg)===regDigits(p.cardReg)):null;
        const byRoom=cands.length>1?cands.find(c=>c.room===sRoom||c.room===cRoom):null;
        const cand=byReg||byRoom||cands[0], ambiguous=cands.length>1&&!byReg&&!byRoom;
        ptaCandByKey.set(k,{name:p.name,cand,ambiguous});
        const badStatus=!!sRoom&&sRoom!==cand.room, badCard=!!cRoom&&cRoom!==cand.room;
        if(!badStatus&&!badCard) continue;
        roomProblems++; if(fl) floorCount[fl]++;
        const wrong=[badStatus?`현황판 ${p.statusRoom}`:'', badCard?`전체시간표 ${p.cardRoom}`:''].filter(Boolean).join(' · ');
        allIssues.push({
          id:'room-'+allIssues.length, category:'room', source:'mismatch', floor:fl,
          patient:p.name, room:cand.room,
          title:'병실 불일치 (PTA 기준)',
          line:`PTA ${cand.room}호 ↔ ${wrong}${ambiguous?' · PTA에 같은 이름이 여러 명이라 확인 필요':''}`,
          time:'', searchText:normKey(`${p.name} ${cand.room} ${p.statusRoom} ${p.cardRoom}`), severityRank:0,
          detail:{kind:'room_mismatch', patient:p.name, pta:cand, statusRoom:p.statusRoom, cardRoom:p.cardRoom, badStatus, badCard, ambiguous}
        });
      }
      // 반대 방향: PTA엔 재활 코드가 있는 환자인데 현황판(입원·재입원)에도 전체시간표 입원 카드에도 없음 — 신환 등록 누락일 수 있다.
      // (재활 코드 X·빈칸은 재활 대상이 아닌 것으로 보고 제외. 현황판·카드 파일이 둘 다 있을 때만 확인)
      if(status && (state.card10Book||state.card3Book)){
        const stState=new Map(); for(const r of status.dischargedList) stState.set(normKey(r.name),'퇴원'); for(const r of status.list) stState.set(normKey(r.name),r.admit);
        for(const [k,recs] of ptaMap){
          if(people.has(k)) continue;
          roomChecked++;
          const codes=[...new Set(recs.map(x=>x.rehab).filter(x=>x&&x!=='X'))]; if(!codes.length) continue;
          roomProblems++;
          const fl=floorOfPatient(recs[0].name, null); if(fl) floorCount[fl]++;
          const st=stState.get(k);
          allIssues.push({
            id:'room-'+allIssues.length, category:'room', source:'ptaonly', floor:fl,
            patient:recs[0].name, room:recs[0].room,
            title:'PTA엔 있는데 현황판·전체시간표에 없음',
            line:`PTA 재활 ${codes.join('/')} · ${st?`현황판엔 ${st} 상태로만 남아 있어요`:'현황판·전체시간표에 이름이 없어요'} — 신환·재입원 등록 누락 확인 필요`,
            time:'', searchText:normKey(`${recs[0].name} ${recs[0].room}`), severityRank:0,
            detail:{kind:'room_ptaonly', patient:recs[0].name, pta:recs[0], codes, statusState:st||''}
          });
        }
      }
    }
  }

  // ---- ② 위치 검증 (매트/테이블현황은 항상 "원본" 시트 기준) ----
  hooks.step('stepLoc','now');
  previewStore = {10:{mat:[], table:[]}, 3:{mat:[], table:[]}}; hooks.set('previewStore', previewStore);
  previewCards = cardsByFloor; hooks.set('previewCards', previewCards);
  if(state.card10Book && (state.mat10Book || state.table10Book)){
    let matEntries=[], tableEntries=[];
    if(state.mat10Book){ const sn=pickOriginalMatSheet(state.mat10Book); matEntries=await collectGridEntries(state.mat10Book, sn); }
    if(state.table10Book){ const sn=pickOriginalTableSheet(state.table10Book); tableEntries=await collectGridEntries(state.table10Book, sn); }
    previewStore[10].mat=matEntries; previewStore[10].table=tableEntries;
    const gridEntries=matEntries.concat(tableEntries);
    locChecked += countLocationChecks(cardsByFloor[10], gridEntries);
    for(const r of compareFloor(cardsByFloor[10], gridEntries, 10)){
      locProblems++; floorCount[10]++;
      allIssues.push(buildLocationIssue(r, allIssues.length, findCard(r.patient, 10)));
    }
  }
  if(state.card3Book && state.mt3Book){
    const matSn=pickOriginalMatSheet(state.mt3Book);
    const matEntries=await collectGridEntries(state.mt3Book, matSn);
    const tableSn=pickOriginalTableSheet(state.mt3Book);
    const tableEntries = tableSn ? await collectGridEntries(state.mt3Book, tableSn) : [];
    previewStore[3].mat=matEntries; previewStore[3].table=tableEntries;
    let gridEntries=matEntries.concat(tableEntries);
    locChecked += countLocationChecks(cardsByFloor[3], gridEntries);
    for(const r of compareFloor(cardsByFloor[3], gridEntries, 3)){
      locProblems++; floorCount[3]++;
      allIssues.push(buildLocationIssue(r, allIssues.length, findCard(r.patient, 3)));
    }
  }
  // ---- ②-2 위치 검증(두 번째): 작업치료현황 "평일시간표(원본)" vs 전체시간표(원본) 위치 대조 ----
  if(sched && (state.card10Book || state.card3Book)){
    const schedLoc = buildScheduleLocationChecks(sched.occ, cardIndex);
    locChecked += schedLoc.checked;
    for(const r of schedLoc.out){
      locProblems++; floorCount[r.floor]++;
      allIssues.push(buildScheduleLocationIssue(r, allIssues.length));
    }
  }
  // ---- ②-3 위치 검증(세 번째): 작업치료현황 "토요일&공휴일 시간표" vs 전체시간표(원본) 위치 대조 ----
  previewSaturday={occs:[], weekdayCode:new Map(), recoverySet:new Set()}; hooks.set('previewSaturday', previewSaturday);
  if(status){
    // "현황(회복기)" 시트에 있는 환자 = 회복기 환자. 토요일엔 회복기 환자만 정규 배정(SOT/RDT 등) 가능하고,
    // 회복기가 아닌 환자는 연하·전기치료만 가능하다는 병원 규칙을 판정에 반영한다.
    for(const rec of status.list) previewSaturday.recoverySet.add(normKey(rec.name));
  }
  if(state.statusBook){
    const satOccs = await parseSaturdayScheduleSheet(state.statusBook);
    previewSaturday.occs = satOccs;
    if(status) checkScheduleResidue('토요일&공휴일 시간표(원본)', satOccs.map(o=>({name:o.name,type:o.type,time:o.time,therapist:o.therapist})));
    if(sched){
      for(const o of sched.occ){
        if((o.type==='sot'||o.type==='rdt') && o.code){
          // 환자 이름만으로 코드를 저장하면, 그 환자가 평일에 R(연하)과 ST/SM(작업)을 각각 다른 시간에
          // 둘 다 받는 경우 먼저 발견된 쪽 코드가 다른 종류 비교에도 잘못 쓰이는 문제가 있었다.
          // 이름+종류(sot/rdt)로 따로 저장해서, 토요일 ST는 반드시 평일 ST/SM끼리만 비교하게 한다.
          const k=normKey(o.name)+'|'+o.type;
          if(!previewSaturday.weekdayCode.has(k)) previewSaturday.weekdayCode.set(k, new Set());
          previewSaturday.weekdayCode.get(k).add(o.code); // ST와 SM을 둘 다 받는 환자는 코드를 모두 모은다(먼저 나온 하나만 쓰면 오탐이 난다)
        }
      }
    }
    if(state.card10Book || state.card3Book){
      const satLoc = buildSaturdayLocationChecks(satOccs, findCard, previewSaturday.recoverySet);
      locChecked += satLoc.checked;
      for(const r of satLoc.out){
        locProblems++; if(r.floor) floorCount[r.floor]++;
        allIssues.push(buildSaturdayLocationIssue(r, allIssues.length));
      }
    }
  }
  hooks.step('stepLoc','done');


  // ---- ③ 치료사 매칭 검증 ----
  hooks.step('stepTher','now');
  if(sched && (state.card10Book || state.card3Book)){
    const typeMap={sot:'작업치료', rdt:'연하치료'};
    for(const o of sched.occ){
      if(o.type!=='sot' && o.type!=='rdt') continue;
      const card=findCard(o.name, o.floor); if(!card) continue;
      const label=typeMap[o.type]; const expected=card.therapists[label]||[];
      if(!expected.length) continue;
      therChecked++;
      const ok=expected.some(n=>normKey(n)===normKey(o.therapist));
      if(!ok){
        therProblems++; floorCount[o.floor]++;
        allIssues.push({
          id:'ther-'+allIssues.length, category:'therapist', floor:o.floor,
          patient:o.name, room:card.room,
          title: o.type==='sot' ? '작업치료 치료사 불일치' : '연하치료 치료사 불일치',
          line:`${o.time} · ${o.type==='sot'?'작업치료':'연하치료'}`,
          time:o.time, searchText:normKey(`${o.name} ${card.room} ${o.time} ${o.therapist} ${expected.join(' ')}`),
          severityRank:0,
          detail:{kind:'therapist', floor:o.floor, kindLabel:o.type==='sot'?'작업(SOT)':'연하(RDT)', patient:o.name, room:card.room, day:'', time:o.time, origin:o.therapist, expected:expected.join(' / ')}
        });
      }
    }
    for(const c of sched.ccrt){
      const card=findCard(c.name, c.floor); if(!card) continue;
      const expected=card.therapists['인지치료']||[];
      if(!expected.length) continue;
      therChecked++;
      const ok=expected.some(n=>normKey(n)===normKey(c.therapist));
      if(!ok){
        therProblems++; floorCount[c.floor]++;
        allIssues.push({
          id:'ther-'+allIssues.length, category:'therapist', floor:c.floor,
          patient:c.name, room:card.room,
          title:'인지치료(CCRT) 치료사 불일치',
          line:`${c.day}요일 · ${c.time} · 인지치료`,
          time:c.time, searchText:normKey(`${c.name} ${card.room} ${c.time} ${c.day} ${c.therapist} ${expected.join(' ')}`),
          severityRank:0,
          detail:{kind:'therapist', floor:c.floor, kindLabel:'인지(CCRT)', patient:c.name, room:card.room, day:c.day, time:c.time, origin:c.therapist, expected:expected.join(' / ')}
        });
      }
    }
  }
  // ---- ④ 인수인계 대조: 담당 치료사(vs 평일시간표(원본)) · 주치의(vs 전체시간표(원본)) ----
  let handoverListAll=null; const notypeKeys=new Set(); // "치료 기록 없음"으로 이미 잡히는 (환자|치료) — 시간표 담당 미작성에서 또 알리지 않는다
  if(state.handoverBook||state.handoverLiveOk){
    const handoverList = state.handoverBook ? await parseHandoverSheet(state.handoverBook) : state.handoverLiveList;
    handoverListAll=handoverList;
    const handoverMap = buildHandoverIndex(handoverList);
    if(sched){
      const htRes = buildHandoverTherapistChecks(handoverMap, sched.occ, sched.ccrt, findCard);
      handoverChecked += htRes.checked;
      for(const r of htRes.out){
        handoverProblems++;
        const fl = floorOfPatient(r.name, null);
        if(fl) floorCount[fl]++;
        const typeLabel = r.type==='sot'?'작업(SOT)':r.type==='rdt'?'연하(RDT)':'인지(CCRT)';
        if(r.kind==='orphan'){
          allIssues.push({
            id:'handover-'+allIssues.length, category:'handover', source:'orphan', floor:fl,
            patient:r.name, room:'',
            title:`${typeLabel} 인수인계만 있음 (평일시간표·전체시간표 모두 없음)`,
            line:`인수인계 담당 ${r.handoverTherapist}`,
            time:'', searchText:normKey(`${r.name} ${r.handoverTherapist}`),
            severityRank:0,
            detail:{kind:'handover_orphan', patient:r.name, type:typeLabel, handoverTherapist:r.handoverTherapist, hasCard:r.hasCard}
          });
          continue;
        }
        allIssues.push({
          id:'handover-'+allIssues.length, category:'handover', source:'therapist', floor:fl,
          patient:r.name, room:'',
          title: r.kind==='noSched' ? `${typeLabel} 인수인계 있음(평일시간표에 배정 없음)` : `${typeLabel} 담당 치료사 불일치`,
          line: r.kind==='noSched' ? `인수인계 담당 ${r.handoverTherapist}` : `인수인계 ${r.handoverTherapist} → 평일시간표 ${r.schedTherapists}`,
          time:'', searchText:normKey(`${r.name} ${r.handoverTherapist} ${r.schedTherapists||''}`),
          severityRank:0,
          detail:{kind:'handover_therapist', patient:r.name, type:typeLabel, handoverTherapist:r.handoverTherapist, schedTherapists:r.schedTherapists||'(평일시간표에 배정 없음)'}
        });
      }
    }
    if(sched){
      const exRes = buildHandoverExcessChecks(handoverList, sched.occ, sched.ccrt);
      handoverChecked += exRes.checked;
      for(const r of exRes.out){
        handoverProblems++;
        const fl = floorOfPatient(r.name, null);
        if(fl) floorCount[fl]++;
        const typeLabel = r.type==='sot'?'작업(SOT)':r.type==='rdt'?'연하(RDT)':'인지(CCRT)';
        allIssues.push({
          id:'handover-'+allIssues.length, category:'handover', source:'excess', floor:fl,
          patient:r.name, room:'',
          title:`${typeLabel} 인수인계 작성자 수 초과 (${r.writerCount}명 작성 / 실제 배정 ${r.realCount}명)`,
          line:`작성자: ${r.writers.join(', ')} · 실제 배정: ${r.realTherapists.join(', ')||'(없음)'}`,
          time:'', searchText:normKey(`${r.name} ${r.writers.join(' ')} ${r.realTherapists.join(' ')}`),
          severityRank:r.writerCount-r.realCount,
          detail:{kind:'handover_excess', patient:r.name, type:typeLabel, writerCount:r.writerCount, realCount:r.realCount, writers:r.writers, realTherapists:r.realTherapists, extra:r.extra}
        });
      }
    }
    if(state.card10Book || state.card3Book){
      const drRes = buildDoctorChecks(handoverList, findCard);
      handoverChecked += drRes.checked;
      for(const r of drRes.out){
        handoverProblems++; if(r.floor) floorCount[r.floor]++;
        allIssues.push({
          id:'handover-'+allIssues.length, category:'handover', source:'doctor', floor:r.floor,
          patient:r.name, room:r.room,
          title:'주치의 불일치',
          line:`인수인계 ${r.handoverDoctor}${r.writers.length?`(${r.writers.join('·')}${r.types.length?' '+r.types.join('/'):''})`:''} → 전체시간표 ${r.cardDoctor}`,
          time:'', searchText:normKey(`${r.name} ${r.room} ${r.handoverDoctor} ${r.cardDoctor} ${r.writers.join(' ')}`),
          severityRank:0,
          detail:{kind:'handover_doctor', patient:r.name, room:r.room, handoverDoctor:r.handoverDoctor, cardDoctor:r.cardDoctor, writers:r.writers, types:r.types}
        });
      }
    }
    // 인수인계 기록은 있는데 주치의(RM)·작성자 칸이 비어 있는 경우 — 현황판 입원·재입원 환자의 SOT/RDT/CCRT 기록만 본다. 그 칸 자체를 읽지 못하는 자료(열이 없는 엑셀 등)는 건너뛴다.
    if(status){
      const hasDr=handoverList.some(e=>e.doctor), hasTh=handoverList.some(e=>e.therapist);
      const act=new Set(status.list.filter(r=>r.admit==='입원'||r.admit==='재입원').map(r=>normKey(r.name))), seenF=new Set(), byPt=new Map(), tl={sot:'작업(SOT)',rdt:'연하(RDT)',ccrt:'인지(CCRT)'};
      for(const e of handoverList){ // 최신 기록이 먼저 — 같은 환자·치료·작성자는 최신 기록 하나만 본다
        if(!e.type) continue;
        const k=normKey(e.name), rk=k+'|'+e.type+'|'+normKey(e.therapist||''); if(seenF.has(rk)) continue; seenF.add(rk);
        if(!act.has(k)) continue;
        const miss=[]; if(hasDr&&!e.doctor) miss.push('주치의(RM)'); if(hasTh&&!e.therapist) miss.push('작성자');
        if(!miss.length) continue;
        if(!byPt.has(k)) byPt.set(k,{name:e.name,items:[]});
        byPt.get(k).items.push({label:tl[e.type], therapist:e.therapist||'', miss});
      }
      for(const {name,items} of byPt.values()){
        handoverProblems++;
        const fl=floorOfPatient(name, null); if(fl) floorCount[fl]++;
        const rec=status.list.find(r=>normKey(r.name)===normKey(name)&&(r.admit==='입원'||r.admit==='재입원'));
        const fields=[...new Set(items.flatMap(x=>x.miss))];
        allIssues.push({
          id:'handover-'+allIssues.length, category:'handover', source:'nofield', floor:fl,
          patient:name, room:rec?rec.room:'',
          title:`인수인계 ${fields.join('·')} 미작성`,
          line:items.map(x=>`${x.label} · ${x.therapist||'작성자 없음'} → ${x.miss.join('·')} 비어 있음`).join(' · '),
          time:'', searchText:normKey(`${name} ${rec?rec.room:''} ${items.map(x=>x.therapist+x.label).join(' ')} ${fields.join(' ')}`), severityRank:items.length,
          detail:{kind:'handover_nofield', patient:name, room:rec?rec.room:'', items}
        });
      }
    }
    // 인수인계 기록은 있는데 치료내용(Tx) 칸이 비어 있는 경우 — 현황판 입원·재입원 환자의 기록만 본다(퇴원·외래의 지난 기록은 제외). 실시간 연동 기록에만 Tx가 들어 있어, 엑셀 파일로 올린 인수인계는 이 확인을 건너뛴다.
    if(status){
      const act=new Set(status.list.filter(r=>r.admit==='입원'||r.admit==='재입원').map(r=>normKey(r.name))), seenTx=new Set(), byPt=new Map();
      for(const e of handoverList){ // 목록은 최신 기록이 먼저 — 같은 환자·치료·작성자는 최신 기록 하나만 본다
        if(!e.type) continue;
        const k=normKey(e.name), rk=k+'|'+e.type+'|'+normKey(e.therapist||''); if(seenTx.has(rk)) continue; seenTx.add(rk);
        if(e.tx!==''||!act.has(k)) continue; // tx가 없음(undefined)이면 Tx를 읽지 않는 방식이라 건너뜀
        if(!byPt.has(k)) byPt.set(k,{name:e.name,items:[]});
        byPt.get(k).items.push({label:({sot:'작업(SOT)',rdt:'연하(RDT)',ccrt:'인지(CCRT)'})[e.type], therapist:e.therapist||''});
      }
      for(const {name,items} of byPt.values()){
        handoverProblems++;
        const fl=floorOfPatient(name, null); if(fl) floorCount[fl]++;
        const rec=status.list.find(r=>normKey(r.name)===normKey(name)&&(r.admit==='입원'||r.admit==='재입원'));
        allIssues.push({
          id:'handover-'+allIssues.length, category:'handover', source:'notx', floor:fl,
          patient:name, room:rec?rec.room:'',
          title:`인수인계 ${items.map(x=>x.label).join('·')} Tx(치료내용) 미작성`,
          line:items.map(x=>`${x.label} · 작성자 ${x.therapist||'확인 필요'}`).join(' · '),
          time:'', searchText:normKey(`${name} ${rec?rec.room:''} ${items.map(x=>x.therapist).join(' ')}`), severityRank:items.length,
          detail:{kind:'handover_notx', patient:name, room:rec?rec.room:'', items}
        });
      }
    }
    // 현황판엔 그 치료 횟수가 있는데 인수인계엔 그 치료 기록이 없는 경우 — 환자 단위가 아니라 치료 단위로 확인.
    // 인수인계 기록이 아예 없는 환자는 그랜드라운딩의 "미등록"이 다루므로 여기선 제외한다. 담당 치료사는 평일시간표 → 카드 순으로 알려준다.
    if(status){
      const hasTypes=new Map(); for(const e of handoverList){ if(!e.type) continue; const k=normKey(e.name); if(!hasTypes.has(k)) hasTypes.set(k,new Set()); hasTypes.get(k).add(e.type); }
      const schedBy=sched?buildSchedTherapistIndex(sched.occ,sched.ccrt):new Map();
      const tLabel={sot:'작업(SOT)',rdt:'연하(RDT)',ccrt:'인지(CCRT)'}, cardLabel={sot:'작업치료',rdt:'연하치료',ccrt:'인지치료'};
      for(const rec of status.list){
        if(rec.admit!=='입원'&&rec.admit!=='재입원') continue;
        const k=normKey(rec.name), ty=hasTypes.get(k); if(!ty) continue;
        handoverChecked++;
        const miss=['sot','rdt','ccrt'].filter(t=>rec[t]>0&&!ty.has(t)); if(!miss.length) continue; for(const t of miss) notypeKeys.add(k+'|'+t);
        handoverProblems++;
        const fl=floorOfPatient(rec.name, null); if(fl) floorCount[fl]++;
        const card=findCard(rec.name);
        const items=miss.map(t=>{ const set=schedBy.get(k+'|'+t); return {label:tLabel[t], count:rec[t], therapists:set&&set.size?[...set]:((card&&card.therapists[cardLabel[t]])||[])}; });
        allIssues.push({
          id:'handover-'+allIssues.length, category:'handover', source:'notype', floor:fl,
          patient:rec.name, room:rec.room,
          title:`인수인계에 ${items.map(x=>x.label).join('·')} 기록 없음`,
          line:items.map(x=>`${x.label} ${x.count}회 → 담당 ${x.therapists.join(', ')||'확인 필요'}`).join(' · '),
          time:'', searchText:normKey(`${rec.name} ${rec.room} ${items.map(x=>x.therapists.join(' ')).join(' ')}`), severityRank:items.length,
          detail:{kind:'handover_notype', patient:rec.name, room:rec.room, items}
        });
      }
    }
  }
  // ---- ④-2 평일시간표(원본) 담당 선생님이 인수인계를 썼는지: 시간표에 그 환자·치료로 배정된 선생님마다, 그 선생님 이름의 인수인계 기록이 있는지 본다 ----
  // (인수인계가 아예 없는 환자도 포함하며, 위 "치료 기록 없음"으로 이미 잡힌 치료는 건너뛴다. 현황판 입원·재입원 환자만 본다.)
  if(status&&sched&&handoverListAll){
    const act=new Set(status.list.filter(r=>r.admit==='입원'||r.admit==='재입원').map(r=>normKey(r.name))), wr=new Map();
    for(const e of handoverListAll){ if(!e.type||!e.therapist) continue; const key=normKey(e.name)+'|'+e.type; if(!wr.has(key)) wr.set(key,new Set()); for(const w of String(e.therapist).split('/')) if(normKey(w)) wr.get(key).add(normKey(w)); }
    const tl={sot:'작업(SOT)',rdt:'연하(RDT)',ccrt:'인지(CCRT)'}, byPt=new Map();
    for(const [key,set] of buildSchedTherapistIndex(sched.occ,sched.ccrt)){
      const [k,t]=key.split('|'); if(!act.has(k)||notypeKeys.has(key)) continue;
      const W=wr.get(key)||new Set(), miss=[...set].filter(th=>th&&!W.has(normKey(th)));
      if(!miss.length) continue;
      if(!byPt.has(k)) byPt.set(k,{name:status.list.find(r=>normKey(r.name)===k).name,items:[]});
      for(const th of miss) byPt.get(k).items.push({label:tl[t], type:t, therapist:th, none:!W.size});
    }
    for(const {name,items} of byPt.values()){
      handoverProblems++;
      const fl=floorOfPatient(name, null); if(fl) floorCount[fl]++;
      const rec=status.list.find(r=>normKey(r.name)===normKey(name)&&(r.admit==='입원'||r.admit==='재입원'));
      allIssues.push({
        id:'handover-'+allIssues.length, category:'handover', source:'nowriter', floor:fl,
        patient:name, room:rec?rec.room:'',
        title:`인수인계 미작성 — 시간표 담당 ${[...new Set(items.map(x=>x.therapist))].join('·')}`,
        line:items.map(x=>`${x.label} · ${x.therapist}${x.none?' (인수인계 없음)':''}`).join(' · '),
        time:'', searchText:normKey(`${name} ${rec?rec.room:''} ${items.map(x=>x.therapist).join(' ')}`), severityRank:items.length,
        detail:{kind:'handover_nowriter', patient:name, room:rec?rec.room:'', items}
      });
    }
  }
  // 이번에 검사하지 못한 항목 — 파일이 없거나 자료 방식 때문에 건너뛴 것을 결과 위쪽에 알린다
  crossSkipNotes=[]; hooks.set('crossSkipNotes', crossSkipNotes); { const hoOk=state.handoverBook||state.handoverLiveOk;
    if(!hoOk) crossSkipNotes.push('인수인계 대조 전체(인수인계 없음)');
    else {
      if(state.handoverBook) crossSkipNotes.push('Tx 미작성(엑셀 인수인계는 Tx 칸을 읽지 않아요)');
      if(handoverListAll&&handoverListAll.length&&!handoverListAll.some(e=>e.doctor)) crossSkipNotes.push('주치의(RM) 미작성(인수인계에 주치의 칸이 없어요)');
      if(!status) crossSkipNotes.push('치료 기록 없음·미작성 계열(작업치료현황 없음)');
      else if(!sched) crossSkipNotes.push('시간표 담당 미작성(평일시간표 없음)');
    }
    if(!state.ptaBook) crossSkipNotes.push('PTA 대조(PTA 재원현황 없음)'); }
  // ---- ⑤ 주치의(RM) 대조: PTA 재원현황의 의사를 기준으로 현황판 진료과 · 전체시간표 카드 · 인수인계 주치의가 같은지 ----
  // PTA에 같은 이름이 여러 명이라 누구인지 못 고른 경우(ambiguous)는 오탐을 막기 위해 건너뛴다.
  if(ptaMapAll){
    const hoDoctor=new Map(); { const seenRec=new Set(); for(const e of (handoverListAll||[])){ if(!e.doctor) continue; const rk=normKey(e.name)+'|'+(e.type||'')+'|'+normKey(e.therapist||''); if(seenRec.has(rk)) continue; seenRec.add(rk); const k=normKey(e.name); if(!hoDoctor.has(k)) hoDoctor.set(k,[]); if(!hoDoctor.get(k).includes(e.doctor)) hoDoctor.get(k).push(e.doctor); } } // 환자의 모든 인수인계 기록(치료사·종류별 맨 위)에 적힌 주치의 — 맨 위 한 건만 보면 다른 기록의 틀린 값을 놓침
    const stDept=new Map(); if(status) for(const r of status.list){ if(r.admit==='입원'||r.admit==='재입원') stDept.set(normKey(r.name), r.dept); }
    for(const [k,pc] of ptaCandByKey){
      const pRm=normDoctor(pc.cand.rm); if(pc.ambiguous||!pRm) continue;
      const card=findCard(pc.name);
      const vals=[['현황판',stDept.get(k)],['전체시간표',card&&card.doctor],...(hoDoctor.get(k)||[]).map(v=>['인수인계',v])].filter(([,v])=>v);
      if(!vals.length) continue;
      roomChecked++;
      const bad=vals.filter(([,v])=>v!==pRm); if(!bad.length) continue;
      roomProblems++;
      const fl=floorOfPatient(pc.name, null); if(fl) floorCount[fl]++;
      allIssues.push({
        id:'room-'+allIssues.length, category:'room', source:'rm', floor:fl,
        patient:pc.name, room:pc.cand.room,
        title:'주치의(RM) 불일치 (PTA 기준)',
        line:`PTA ${pRm} ↔ ${bad.map(([n,v])=>`${n} ${v}`).join(' · ')}`,
        time:'', searchText:normKey(`${pc.name} ${pRm} ${vals.map(x=>x[1]).join(' ')}`), severityRank:bad.length,
        detail:{kind:'room_rm', patient:pc.name, room:pc.cand.room, pta:pRm, vals:vals.map(([n,v])=>({name:n,value:v,bad:v!==pRm}))}
      });
    }
  }
  hooks.step('stepTher','done');

  // 수정 지시서가 "어느 칸인지"까지 알려주도록 불일치마다 칸 주소를 찾아 붙인다(읽기만 함, 검증 결과에는 영향 없음)
  try{ attachRefs(allIssues, {status, sched, findCard, gridEntries:(fl)=>[...((previewStore[fl]&&previewStore[fl].mat)||[]), ...((previewStore[fl]&&previewStore[fl].table)||[])]}); }catch(e){ console.error(e); }
  hooks.set('issues', allIssues); hooks.set('allDetected', allIssues); hooks.set('excludedIssues', []);
  const stats={countChecked,countProblems,locChecked,locProblems,therChecked,therProblems,handoverChecked,handoverProblems,evalChecked,evalProblems,roomChecked,roomProblems};
  hooks.publish(stats);
  // 이번에 읽은 자료의 규모 — 이력과 비교해 "자료가 평소와 달라요" 경고에 쓴다
  crossInputs={ cards10:cardsByFloor[10].length, cards3:cardsByFloor[3].length }; hooks.set('crossInputs', crossInputs);
  if(status){ crossInputs.statusRows=status.list.length; crossInputs.statusActive=status.list.filter(r=>r.admit==='입원'||r.admit==='재입원').length; }
  if(sched) crossInputs.schedOcc=sched.occ.length;
  if(handoverListAll) crossInputs.handover=handoverListAll.length;
  if(ptaMapAll) crossInputs.pta=ptaMapAll.size!=null?ptaMapAll.size:(ptaMapAll.length||0);
  return { stats, floorCount };
}
const api = { run };
root.RehabCore = Object.assign(root.RehabCore || {}, { verifyAll: api });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
