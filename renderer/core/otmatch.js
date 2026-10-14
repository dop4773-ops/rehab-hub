// otmatch.js — 작업치료실 시간표 오더 칸 ↔ 그날 액팅 세션을 짝지어 "미액팅·초과·종류 불일치·D/C인데 액팅"을 가려내는 엔진.
// 치료기록 QA 화면 안의 msRunAnalysis 중 화면과 무관한 계산 부분을 그대로 옮긴 것(로직 변경 없음) — 단위 테스트가 있다.
// 입력: entries(시간표 오더 칸, otschedule.parseScheduleSheet의 entries) · actRows([{patientName,orderName,therapist,start,end}] 이미 OT·대조날짜로 거른 액팅 한 줄씩)
//       dcEntries(일일통계 D/C 명단) · issuesByPatient(오류확인 결과를 환자명으로 모은 것)
// 출력: { rows(환자별), therapistResult(치료사별), slotFlagMap, slotTypeMap, actMap }
// 브라우저: <script src="../core/otmatch.js"> → RehabCore.otMatch / Node: require() (테스트용). findTypeMismatches는 RehabCore.orderType(core/ordertype.js)을 쓴다.
'use strict';
(function (root) {
  function timeToMinutes(text){
    const m = String(text||'').match(/(\d{1,2}):(\d{2})/);
    if(!m) return null;
    return (+m[1])*60 + (+m[2]);
  }
  // FMA·수지기능·일상생활(MBI)·SCIM·인성·치매척도 등 "평가" 계열 처방명 판별용
  // "인지"만 단독으로 넣으면 "전산화인지재활치료"(실제 치료, 평가 아님)까지 걸려서
  // 실제 처방명칭 표기를 기준으로 평가 도구명을 구체적으로 매칭합니다.
  // 작업치료·물리치료·심리치료·언어치료 평가 처방코드(전산화인지 평가는 별도 코드 없이 같은 전산화인지 오더에
  // 치료내용만 "COSAS TEST"로 적는 방식이라 이 목록에 넣지 않습니다)
  const MS_EVAL_CODES = ['EX773','E6613','E6612','EY772','F6221','F6216','EX780','E6641','FY7520','FZ689','FB001','FZ688'];
  const MS_EVAL_CODE_RE = new RegExp('^(' + MS_EVAL_CODES.join('|') + ')\\b', 'i');
  const MS_EVAL_KEYWORDS = /수지기능|일상생활동작|인성검사|치매\s*척도|후글-?마이어|FMA|MBI|SCIM|증상\.?\s*행동평가|GDS|평가/i;
  function isEvalOrder(orderName){
    const n = (orderName || '').trim();
    if(MS_EVAL_CODE_RE.test(n)) return true;
    return MS_EVAL_KEYWORDS.test(n);
  }
  // 카톡 텍스트용: 긴 처방명칭을 짧은 치료 구분으로 단순화
  function simplifyOrderName(orderName){
    const n = orderName || '';
    if(isEvalOrder(n)) return '평가';
    if(/전산화|인지재활/.test(n)) return '전산화인지';
    if(/연하/.test(n)) return '연하치료';
    if(/특수작업치료|특수/.test(n)) return '작업특수';
    if(/수부.*(집중재활|재활프로그램)/.test(n)) return '작업특수';
    if(/복잡작업치료/.test(n)) return '복잡';
    return n;
  }
  function stripDupLetter(name){
    const m = name.match(/^([가-힣]{2,})([A-Za-z])$/);
    if(m) return { base:m[1] };
    return { base:name };
  }

function analyze({ entries, actRows, dcEntries, issuesByPatient }){
  issuesByPatient = issuesByPatient || {};
    const orderMap = {};
    entries.filter(e=>!e.conflict).forEach(e=>{
      if(!orderMap[e.name]) orderMap[e.name] = { count:0, list:[] };
      orderMap[e.name].count++;
      orderMap[e.name].list.push(e);
    });
    Object.values(orderMap).forEach(o=>{
      o.list.sort((a,b)=> (a.timeSlot||'').localeCompare(b.timeSlot||'') || a.row-b.row);
    });
    const dupGroups = {};
    Object.keys(orderMap).forEach(name=>{
      const { base } = stripDupLetter(name);
      if(!dupGroups[base]) dupGroups[base] = [];
      dupGroups[base].push(name);
    });

    // 액팅 집계: 이미 분류된 OT 오더 + 선택 날짜만, 연속 시간은 세션으로 묶음
    const byPatient = {};
    (actRows || []).forEach(a=>{
      const name = a.patientName;
      if(!name) return;
      (byPatient[name] = byPatient[name] || []).push({ orderName:a.orderName, therapist:a.therapist, start:a.start, end:a.end });
    });
    const actMap = {};
    for(const name in byPatient){
      const list = byPatient[name].slice().sort((a,b)=>a.start.localeCompare(b.start));
      let sessions = 0, prev = null;
      const sessionList = [];
      list.forEach(cur=>{
        const curIsEval = isEvalOrder(cur.orderName);
        // 같은 처방명·연속된 시간이면 하나의 세션으로 묶습니다.
        // (담당 치료사가 대신 하는 경우 등, 두 기록의 치료사 표기가 달라도 같은 오더를 이어서 했으면 같은 세션으로 봅니다.)
        const sameOrderContiguous = prev && prev.orderName===cur.orderName && prev.end===cur.start;
        // 평가(FMA/수지기능/일상생활/SCIM/인성/치매척도 등)는 한 타임에 여러 세부검사를 기록하는데,
        // 시간이 이어지지 않고 아예 같은 시간대(예: 14:10~14:40)로 여러 건 겹쳐서 찍히는 경우도 많아서
        // 겹치거나(음수) 어느 정도 벌어진 경우까지 넉넉하게 같은 평가 세션으로 묶습니다.
        const evalContinuation = prev && curIsEval && isEvalOrder(prev.orderName) &&
          (()=>{ const gap = timeToMinutes(cur.start) - timeToMinutes(prev.end); return gap!=null && gap>=-60 && gap<=90; })();
        if(sameOrderContiguous || evalContinuation){
          sessionList[sessionList.length-1].end = cur.end;
        } else {
          sessions++;
          sessionList.push({ orderName:cur.orderName, start:cur.start, end:cur.end, therapist:cur.therapist });
        }
        prev = cur;
      });
      actMap[name] = { count: sessions, list: sessionList };
    }

    // 시간표에 "김강숙S"처럼 이름에 S가 공백 없이 붙어 있으면 동명이인 구분 알파벳으로 읽히는데, 액팅 기록에 그 이름이 없고 알파벳 없는 이름만 있으면
    // 작업특수(S) 표기를 붙여 쓴 같은 환자로 보고 합친다(안 그러면 "김강숙S" 미액팅 1건 + "김강숙" 초과 1건으로 갈라져 잡힌다).
    Object.keys(orderMap).forEach(name=>{
      const m = name.match(/^([가-힣]{2,})S$/);
      if(!m || actMap[name] || !actMap[m[1]]) return;
      const dst = orderMap[m[1]] || (orderMap[m[1]] = { count:0, list:[] });
      dst.count += orderMap[name].count; dst.list.push(...orderMap[name].list); delete orderMap[name];
      dst.list.sort((a,b)=> (a.timeSlot||'').localeCompare(b.timeSlot||'') || a.row-b.row);
      dupGroups[m[1]] = (dupGroups[m[1]] || []).filter(n=>n!==name);
      if(!dupGroups[m[1]].includes(m[1])) dupGroups[m[1]].push(m[1]);
    });
    // 예정 오더와 액팅 세션을 "가장 가까운 시작 시간" 기준으로 1:1 매칭해서
    // 실제로 어느 시간대가 미액팅인지 더 정확히 추정합니다(그래도 추정치입니다).
    const slotFlagMap = {};
    const allNames = new Set([...Object.keys(orderMap), ...Object.keys(actMap)]);
    const rows = [...allNames].map(name=>{
      const ord = orderMap[name] || { count:0, list:[] };
      const act = actMap[name] || { count:0, list:[] };
      const diff = ord.count - act.count;
      const orderPool = ord.list.map((e,idx)=>({ idx, minutes: timeToMinutes(e.timeSlot) }));
      const usedIdx = new Set();
      const actSlot = new Map(); // 액팅 세션 → 시간이 가장 가까워서 짝지어진 스케줄 칸
      act.list.forEach(a=>{
        const am = timeToMinutes(a.start);
        let bestIdx = -1, bestDiff = Infinity;
        orderPool.forEach(o=>{
          if(usedIdx.has(o.idx)) return;
          if(am==null || o.minutes==null){
            if(bestIdx===-1) bestIdx = o.idx; // 시간 파싱 실패 시 순서대로라도 매칭
            return;
          }
          const d = Math.abs(o.minutes - am);
          if(d < bestDiff){ bestDiff = d; bestIdx = o.idx; }
        });
        if(bestIdx!==-1){ usedIdx.add(bestIdx); actSlot.set(a, bestIdx); }
      });
      const dupList = dupGroups[stripDupLetter(name).base] || [name];
      const hasEvalOrder = ord.list.some(e=>e.type==='평가');
      const dcMatches = (dcEntries || []).filter(d => d.patientName === name || d.patientName === stripDupLetter(name).base);
      // 스케줄 오더와 다른 종류로 액팅했는지(예: 인지인데 특수로 액팅). D/C 환자는 제외.
      const typeMis = dcMatches.length ? [] : RehabCore.orderType.findTypeMismatches(ord.list, act.list, { simplify: simplifyOrderName });
      // 그 액팅은 종류가 다를 뿐 그 시간 칸에 한 것이므로, 시간이 더 가까워 다른 칸과 짝지어졌다면 이 칸이 액팅된 것으로 옮긴다(안 그러면 이 칸이 미액팅으로 잘못 잡힌다)
      typeMis.forEach(m=>{
        const zi = ord.list.indexOf(m.entry), yi = actSlot.get(m.act);
        if(zi < 0 || yi === undefined || yi === zi) return;
        if(![...actSlot].some(([a2, i2]) => a2 !== m.act && i2 === yi)) usedIdx.delete(yi);
        usedIdx.add(zi); actSlot.set(m.act, zi);
      });
      ord.list.forEach((e,idx)=>{
        const key = `${e.source}|${e.row}|${e.col}`;
        slotFlagMap[key] = usedIdx.has(idx) ? 'ok' : 'missing';
      });
      // "D/C인데 액팅있음"은 D/C 명단에 적힌 바로 그 담당 선생님 이름으로, 그 D/C가 가리키는 것과 같은 종류의
      // 치료가 실제 액팅됐을 때만 잡습니다. (CCRT/BETTERCOG/COMCOG의 평가(TEST)가 D/C될 때는 "구분"을 C로 적으므로,
      // 구분이 C인 경우 전산화인지·평가 계열 액팅만 대조하고, 그 환자의 다른 치료(예: 특수작업치료)는 무시합니다.)
      const DC_CATEGORY_ORDER_TYPES = { 'C': ['전산화인지','평가'], 'S': ['작업특수'] };
      const dcActedBySameTherapist = dcMatches.some(d => {
        const allowedTypes = DC_CATEGORY_ORDER_TYPES[(d.category||'').trim().toUpperCase()];
        return act.list.some(a=>{
          if(!a.therapist || !d.therapist || a.therapist!==d.therapist) return false;
          if(!allowedTypes) return true; // 구분 값이 없거나 알 수 없는 코드면 기존처럼 치료사 일치만으로 판단
          return allowedTypes.includes(simplifyOrderName(a.orderName));
        });
      });
      return {
        name, orderCount:ord.count, actCount:act.count, diff, typeMis,
        orderList: ord.list, actList: act.list, dup: dupList.length>1, rawNames: dupList,
        issues: issuesByPatient[name] || [],
        dc: dcMatches[0] || null, dcMatches, dcActedBySameTherapist, hasEvalOrder
      };
    }).sort((a,b)=> b.diff - a.diff || a.name.localeCompare(b.name,'ko'));

    // D/C 처리된 환자의 미액팅 후보 슬롯은 "missing"이 아니라 "dc"로 표시해 그리드/카톡에서 제외합니다.
    rows.forEach(r=>{
      if(!r.dc) return;
      r.orderList.forEach(e=>{
        const key = `${e.source}|${e.row}|${e.col}`;
        if(slotFlagMap[key]==='missing') slotFlagMap[key] = 'dc';
      });
    });

    // 치료사별 집계 (같은 데이터를 치료사 기준으로도 볼 수 있게)
    const therapistOrderMap = {};
    entries.forEach(e=>{
      const t = e.therapist || '(치료사 미상)';
      if(!therapistOrderMap[t]) therapistOrderMap[t] = { count:0, list:[] };
      therapistOrderMap[t].count++;
      therapistOrderMap[t].list.push(e);
    });
    const therapistActMap = {};
    Object.entries(actMap).forEach(([patientName, act])=>{
      act.list.forEach(s=>{
        const t = s.therapist || '(치료사 미상)';
        if(!therapistActMap[t]) therapistActMap[t] = { count:0, list:[] };
        therapistActMap[t].count++;
        therapistActMap[t].list.push({ orderName:s.orderName, start:s.start, end:s.end, therapist:s.therapist, patientName });
      });
    });
    const slotTypeMap = {}, typeMisAll = [];
    rows.forEach(r=>(r.typeMis||[]).forEach(m=>{
      const key = `${m.entry.source}|${m.entry.row}|${m.entry.col}`;
      slotTypeMap[key] = { schedType:m.schedType, actType:m.actType, orderName:m.act.orderName, start:m.act.start, end:m.act.end, therapist:m.act.therapist, name:r.name };
      typeMisAll.push({ name:r.name, entry:m.entry, act:m.act, schedType:m.schedType, actType:m.actType });
    }));
    const allTherapists = new Set([...Object.keys(therapistOrderMap), ...Object.keys(therapistActMap)]);
    const therapistResultOut = [...allTherapists].map(t=>{
      const ord = therapistOrderMap[t] || { count:0, list:[] };
      const act = therapistActMap[t] || { count:0, list:[] };
      return {
        name:t, orderCount:ord.count, actCount:act.count, diff: ord.count-act.count,
        typeMis: typeMisAll.filter(x=>(x.entry.therapist || '(치료사 미상)')===t).map(x=>({ entry:x.entry, act:x.act, schedType:x.schedType, actType:x.actType, name:x.name })),
        orderList: ord.list, actList: act.list, dup:false, rawNames:[t], issues:[]
      };
    }).sort((a,b)=> b.diff - a.diff || a.name.localeCompare(b.name,'ko'));
  return { rows, therapistResult: therapistResultOut, slotFlagMap, slotTypeMap, actMap };
}

const api = { analyze, timeToMinutes, isEvalOrder, simplifyOrderName, stripDupLetter };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { otMatch: api });
})(typeof window !== 'undefined' ? window : globalThis);
