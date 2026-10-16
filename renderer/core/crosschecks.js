// crosschecks.js — 교차검증이 "문제 항목"을 만드는 계산(순수 함수): 매트·테이블/평일시간표/토요일 시간표 위치 대조, 인수인계 치료사·작성자 수·주치의 대조.
// 교차검증 화면 안에 있던 함수를 그대로 옮긴 것(로직 변경 없음) — 파일 읽기·화면과 무관해서 단위 테스트가 있다(main/test_crosschecks.js).
// 브라우저: <script src="../core/crosschecks.js"> → RehabCore.crossChecks / Node: require() (테스트용). normKey는 core/normalize.js와 같은 규칙.
'use strict';
(function (root) {
const normalizeText = (v) => (v == null ? '' : String(v)).replace(/\r/g, '').trim();
const normKey = (name) => normalizeText(name).replace(/[\s·ㆍ\-\(\)\[\]{}.,\/\\]/g, '').toUpperCase();
function collectFieldOccurrences(sched, name, field){
  const key=normKey(name);
  if(field==='sot'||field==='rdt'){
    return sched.occ.filter(o=>o.type===field && normKey(o.name)===key).map(o=>({time:o.time, therapist:o.therapist}));
  }
  if(field==='erdt'){
    return sched.erdt.filter(e=>normKey(e.name)===key).map(e=>({time:e.time, therapist:e.therapist, extra:`${e.count}회분`}));
  }
  return sched.ccrt.filter(c=>normKey(c.name)===key).map(c=>({time:c.time, therapist:c.therapist, extra:c.day+'요일'}));
}
function buildLocationIssue(r, idx, card){
  const dayEntries = card ? card.entries : [];
  if(r.kind==='mismatch'){
    return {
      id:'loc-'+idx, category:'location', source:'grid', floor:r.floor,
      patient:r.patient, room:r.room,
      title:'이름 불일치 (매트/테이블현황 기준)',
      line:`${r.floor}F · ${r.time} · ${r.loc}`,
      time:r.time, searchText:normKey(`${r.patient} ${r.room} ${r.time} ${r.loc} ${r.gridNames}`),
      severityRank:0,
      detail:{kind:'mismatch', floor:r.floor, time:r.time, loc:r.loc, patient:r.patient, room:r.room, gridNames:r.gridNames, dayEntries}
    };
  }
  return {
    id:'loc-'+idx, category:'location', source:'grid', floor:r.floor,
    patient:r.patient, room:r.room||'',
    title:'기록 없음 (매트/테이블현황 기준)',
    line:`${r.floor}F · ${r.time} · ${r.loc}`,
    time:r.time, searchText:normKey(`${r.patient} ${r.time} ${r.loc}`),
    severityRank:0,
    detail:{kind:'missing', floor:r.floor, time:r.time, loc:r.loc, patient:r.patient, gridNames:r.gridNames, dayEntries}
  };
}
// 두 번째 위치검증: 작업치료현황의 "평일시간표(원본)"에 적힌 치료위치와
// 전체시간표(원본)의 같은 환자·같은 시간 치료위치가 서로 일치하는지 대조한다.
function buildScheduleLocationChecks(occs, cardIndex){
  const out=[]; let checked=0;
  for(const o of occs){
    if(o.type!=='sot' && o.type!=='rdt') continue;
    if(!o.loc) continue; // 위치코드를 읽을 수 없는 셀(예: 워크메이트 등 서식 예외)은 비교 대상에서 제외
    // 같은 이름이라도 반드시 자기 층 카드를 우선 사용한다(층별로 위치 번호 체계가 겹칠 수 있으므로).
    const card = cardIndex[o.floor]?.get(normKey(o.name)) || cardIndex[10].get(normKey(o.name)) || cardIndex[3].get(normKey(o.name));
    if(!card) continue;
    checked++;
    const entry = card.entries.find(e=>e.time===o.timeKey);
    if(!entry){
      out.push({kind:'sched_missing', floor:o.floor, patient:o.name, room:card.room, time:o.timeKey, loc:o.loc, dayEntries:card.entries});
    } else if(entry.loc !== o.loc){
      out.push({kind:'sched_mismatch', floor:o.floor, patient:o.name, room:card.room, time:o.timeKey, scheduleLoc:o.loc, cardLoc:entry.loc, dayEntries:card.entries});
    }
  }
  return {out, checked};
}
function buildScheduleLocationIssue(r, idx){
  if(r.kind==='sched_mismatch'){
    return {
      id:'locsched-'+idx, category:'location', source:'schedule', floor:r.floor,
      patient:r.patient, room:r.room,
      title:'위치 불일치 (평일시간표 기준)',
      line:`${r.floor}F · ${r.time} · 평일시간표 ${r.scheduleLoc} → 전체시간표 ${r.cardLoc}`,
      time:r.time, searchText:normKey(`${r.patient} ${r.room} ${r.time} ${r.scheduleLoc} ${r.cardLoc}`),
      severityRank:0,
      detail:{kind:'sched_mismatch', floor:r.floor, time:r.time, patient:r.patient, room:r.room, scheduleLoc:r.scheduleLoc, cardLoc:r.cardLoc, dayEntries:r.dayEntries||[], sourceLabel:'평일시간표(원본)'}
    };
  }
  return {
    id:'locsched-'+idx, category:'location', source:'schedule', floor:r.floor,
    patient:r.patient, room:r.room||'',
    title:'전체시간표(원본)에 기록 없음',
    line:`${r.floor}F · ${r.time} · 평일시간표 위치 ${r.loc}`,
    time:r.time, searchText:normKey(`${r.patient} ${r.time} ${r.loc}`),
    severityRank:0,
    detail:{kind:'sched_missing', floor:r.floor, time:r.time, loc:r.loc, patient:r.patient, room:r.room, dayEntries:r.dayEntries||[], sourceLabel:'평일시간표(원본)'}
  };
}

function buildSchedTherapistIndex(schedOcc, schedCcrt){
  const schedByKey=new Map();
  for(const o of schedOcc){
    if(o.type!=='sot' && o.type!=='rdt') continue;
    const k=normKey(o.name)+'|'+o.type;
    if(!schedByKey.has(k)) schedByKey.set(k, new Set());
    schedByKey.get(k).add(o.therapist);
  }
  for(const c of schedCcrt){
    const k=normKey(c.name)+'|ccrt';
    if(!schedByKey.has(k)) schedByKey.set(k, new Set());
    schedByKey.get(k).add(c.therapist);
  }
  return schedByKey;
}
function buildHandoverTherapistChecks(handoverMap, schedOcc, schedCcrt, findCardFn){
  const out=[]; let checked=0;
  const schedByKey=buildSchedTherapistIndex(schedOcc, schedCcrt);
  const typeMap={sot:'작업치료', rdt:'연하치료', ccrt:'인지치료'};
  for(const [key, e] of handoverMap){
    if(!e.therapist) continue;
    const schedTherapists=schedByKey.get(key);
    checked++;
    if(!schedTherapists || !schedTherapists.size){
      // 평일시간표(원본)엔 이 환자·종류 배정이 아예 없다. 그런데 전체시간표(원본) 카드에도
      // 이 환자 자체가 없거나 그 치료 종류의 담당자가 아예 없다면, 인수인계서만 혼자 있는(근거 없는)
      // 항목으로 따로 분류한다 — 담당 치료사가 아닌 사람이 인수인계를 적었을 가능성이 있다.
      const card = findCardFn ? findCardFn(e.name) : null;
      const cardHasType = card && card.therapists && (card.therapists[typeMap[e.type]]||[]).length>0;
      if(!card || !cardHasType){
        out.push({kind:'orphan', name:e.name, type:e.type, handoverTherapist:e.therapist, hasCard:!!card});
      } else {
        out.push({kind:'noSched', name:e.name, type:e.type, handoverTherapist:e.therapist});
      }
    } else if(![...schedTherapists].some(t=>normKey(t)===normKey(e.therapist))){
      out.push({kind:'mismatch', name:e.name, type:e.type, handoverTherapist:e.therapist, schedTherapists:[...schedTherapists].join(' / ')});
    }
  }
  return {out, checked};
}
// "치료 개수 이상의 인수인계서" 확인: 같은 환자·같은 종류(SOT/RDT/CCRT)에 대해 실제로 지금
// 평일시간표(원본)에 배정된 치료사 수보다, 인수인계서에 이름을 적은 서로 다른 치료사 수가 더 많으면
// (=지금 배정된 인원 외에 누군가 더 적어놓은 것) 목록으로 뽑아서 보여준다. 인수인계서는 시간이 지나며
// 계속 다시 작성되므로, 여기서는 "현재까지 등록된 모든 항목"에서 등장한 치료사 전체를 센다.
function buildHandoverExcessChecks(handoverList, schedOcc, schedCcrt){
  const schedByKey=buildSchedTherapistIndex(schedOcc, schedCcrt);
  const groups=new Map(); // key -> {name, type, writers:Map(normKey->원래표기)}
  for(const e of handoverList){
    if(!e.type || !e.therapist) continue;
    const key=normKey(e.name)+'|'+e.type;
    if(!groups.has(key)) groups.set(key, {name:e.name, type:e.type, writers:new Map()});
    const g=groups.get(key);
    const wk=normKey(e.therapist);
    if(!g.writers.has(wk)) g.writers.set(wk, e.therapist);
  }
  const out=[]; let checked=0;
  for(const [key, g] of groups){
    checked++;
    const realSet=schedByKey.get(key) || new Set();
    const realKeySet=new Set([...realSet].map(t=>normKey(t)));
    if(g.writers.size > realSet.size){
      const extra=[...g.writers.entries()].filter(([wk])=>!realKeySet.has(wk)).map(([,name])=>name);
      out.push({
        name:g.name, type:g.type,
        writerCount:g.writers.size, realCount:realSet.size,
        writers:[...g.writers.values()], realTherapists:[...realSet], extra
      });
    }
  }
  return {out, checked};
}
// 인수인계의 주치의(RM#) vs 전체시간표(원본) 카드의 주치의(RM#) 비교
// 인수인계에는 같은 환자라도 치료사·치료 종류마다 기록(행)이 따로 있고, 파일 순서가 수정 시각 순서와 다르기도 해서
// "환자당 맨 위 한 건"만 보면 다른 기록에 적힌 틀린 주치의를 놓친다(2026-10 오창수 사례). 그래서 환자의 모든 기록(치료사·종류별 맨 위 기록)을
// 카드와 비교하고, 카드와 다른 주치의가 하나라도 있으면 알린다(같은 틀린 주치의는 환자당 한 건으로 묶고 작성자·종류를 같이 알려 준다).
function buildDoctorChecks(handoverList, findCardFn){
  const rec=new Map(); // 환자+치료사+종류별 맨 위(최신) 기록 — 같은 치료사의 지난 기록은 제외
  for(const e of handoverList){ if(!e.doctor) continue; const k=normKey(e.name)+'|'+(e.type||'')+'|'+normKey(e.therapist||''); if(!rec.has(k)) rec.set(k,e); }
  const checked=new Set(), groups=new Map();
  for(const e of rec.values()){
    const card=findCardFn(e.name);
    if(!card || !card.doctor) continue; // 판정 불가는 집계하지 않음
    checked.add(normKey(e.name));
    if(card.doctor===e.doctor) continue;
    const g=normKey(e.name)+'|'+e.doctor;
    if(!groups.has(g)) groups.set(g,{name:e.name, handoverDoctor:e.doctor, cardDoctor:card.doctor, floor:card.floor, room:card.room, writers:[], types:[]});
    const x=groups.get(g), t=String(e.type||'').toUpperCase();
    if(e.therapist && !x.writers.includes(e.therapist)) x.writers.push(e.therapist);
    if(t && !x.types.includes(t)) x.types.push(t);
  }
  return {out:[...groups.values()], checked:checked.size};
}

// 평일시간표(원본)와 표 레이아웃이 조금 다르고, 10F/3F 층 구분 없이 한 팀(0팀)으로 통합돼 있다.
// 그래서 여기서는 층을 열 위치가 아니라 전체시간표(원본) 카드에서 찾은 층을 그대로 쓴다.
// 토요일&공휴일 시간표에는 메인 표(SOT/RDT) 옆에 "ERDT"(연하전기) 구역이 별도로 있다.
// 이 구역은 "치료사" 글자가 두 번(S1~S4용, S5~S8용) 나오는 구조라 메인 표와는 다르게 파싱해야 한다.
// 토요일&공휴일 시간표엔 위치(매트/테이블 번호)가 기록되지 않고 이름+코드(ST/SM/MSK 등)만 있어서
// 시간·위치까지 비교할 수는 없다. 대신 "이 시간표에 있는 환자가 전체시간표(원본)에 실제로 있는지"를 확인한다
// (퇴원했는데 아직 토요일 배정표에 남아있거나, 이름이 다르게 적힌 경우 등을 잡아낼 수 있다).
function buildSaturdayLocationChecks(occs, findCardFn, recoverySet){
  const out=[]; let checked=0;
  const seen=new Set();
  for(const o of occs){
    if(o.type!=='sot' && o.type!=='rdt' && o.type!=='erdt') continue;
    const key=normKey(o.name);
    const isRecovery = !recoverySet || recoverySet.size===0 || recoverySet.has(key);
    // 병원 규칙: 토요일엔 회복기 환자만 참여 가능하고, 회복기가 아닌 환자는 전기치료(연하전기=ERDT)만 가능하다.
    // ERDT는 그 예외 항목 자체이므로 규칙 위반 대상에서 제외한다.
    if(o.type!=='erdt' && !isRecovery){
      checked++;
      out.push({kind:'rule', patient:o.name, time:o.timeKey, therapist:o.therapist, code:o.code, type:o.type});
      continue; // 회복기가 아니면애초에 회복기 전용 카드가 없을 수 있어 존재 확인은 의미가 없다
    }
    if(seen.has(key)) continue; seen.add(key); // 같은 환자가 여러 시간대에 나올 수 있어 1인 1회만 확인
    checked++;
    const card=findCardFn(o.name);
    if(!card) out.push({kind:'exist', patient:o.name, time:o.timeKey, therapist:o.therapist});
  }
  return {out, checked};
}
// 토요일 코드(ST/SM)가 평일시간표(원본)의 코드와 다른가. 평일에 같은 환자가 ST와 SM을 둘 다 받으면 둘 중 하나면 정상이다(평일 코드 모음 안에 있으면 OK).
// weekdayCodes: 평일 코드 목록/Set(없거나 비어 있으면 비교 안 함) · satCode: 토요일 코드
function satCodeMismatch(weekdayCodes, satCode){
  const set = weekdayCodes instanceof Set ? weekdayCodes : new Set(weekdayCodes||[]);
  return !!(satCode && set.size && !set.has(satCode));
}
function buildSaturdayLocationIssue(r, idx){
  if(r.kind==='rule'){
    const typeLabel = r.type==='rdt' ? '연하(RDT)' : '작업(SOT)';
    return {
      id:'locsat-'+idx, category:'location', source:'saturday', floor:null,
      patient:r.patient, room:'',
      title:`회복기 아닌 환자 ${typeLabel} 배정 (토요일 규칙 위반)`,
      line:`${r.time} · 담당 ${r.therapist} · 코드 ${r.code||'-'}`,
      time:r.time, searchText:normKey(`${r.patient} ${r.time} ${r.therapist}`),
      severityRank:0,
      detail:{kind:'sat_rule', time:r.time, patient:r.patient, therapist:r.therapist, code:r.code, type:r.type}
    };
  }
  return {
    id:'locsat-'+idx, category:'location', source:'saturday', floor:null,
    patient:r.patient, room:'',
    title:'전체시간표(원본)에 없음 (토요일&공휴일 시간표 기준)',
    line:`${r.time} · 담당 ${r.therapist}`,
    time:r.time, searchText:normKey(`${r.patient} ${r.time} ${r.therapist}`),
    severityRank:0,
    detail:{kind:'sat_missing', time:r.time, patient:r.patient, therapist:r.therapist}
  };
}


const api = { collectFieldOccurrences, buildLocationIssue, buildScheduleLocationChecks, buildScheduleLocationIssue, buildSchedTherapistIndex, buildHandoverTherapistChecks, buildHandoverExcessChecks, buildDoctorChecks, buildSaturdayLocationChecks, buildSaturdayLocationIssue, satCodeMismatch };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { crossChecks: api });
})(typeof window !== 'undefined' ? window : globalThis);
