// otschedule.js — 작업치료실 시간표(평일·토요일/공휴일) 시트 한 장을 읽어 "오더 칸 목록"과 미리보기용 격자 정보로 바꾸는 순수 함수.
// 치료기록 QA 화면 안에 있던 파서를 그대로 옮긴 것(로직 변경 없음) — 다른 도구(홈·환자 검색 등)도 같은 파서를 쓰고, 단위 테스트를 붙이려는 목적.
// rows: SheetJS sheet_to_json(header:1)과 같은 2차원 배열. opts: { erdtTherapists:[이름…](단독 "E"를 연하전기로 인정하는 치료사), excelSerialToDate(fn: 엑셀 날짜 셀 → Date) }
// 브라우저: <script src="../core/otschedule.js"> → RehabCore.otSchedule / Node: require() (테스트용)
'use strict';
(function (root) {
const WEEKDAY_CHARS = ['일','월','화','수','목','금','토'];
const MS_MINI_TITLE_RE = /^(ERDT|CCRT|BETTER|COMCOG)$/i;
function msNormText(v){ if(v==null) return ''; return String(v).replace(/\u3000/g,' ').replace(/\r\n?/g,'\n').trim(); }
// 치료사 표기 뒤에 붙는 조(A/B)나 "OT" 표시를 뗀 이름("김기범OT"→"김기범", "이승규B"→"이승규")
function msBaseTherapistName(n){ return String(n||'').replace(/\s*(OT|PT|ST)$/i,'').replace(/[A-Z]$/,''); }
// 시간표 치료사 칸 머리글의 직종 표시("엄주용OT", "김OT" 등)는 이름이 아니므로 뗀다 — 액팅 기록의 치료사 이름("엄주용")과 같은 사람으로 본다
function msCleanTherapistHeader(t){ return String(t||'').replace(/^([가-힣]{2,})\s*(OT|PT|ST)$/i,'$1'); }
// 엑셀 날짜 칸 → Date(로컬 자정). 일련번호(숫자)·Date 객체·"2026-10-15" 글자를 읽는다.
function defaultToDate(v){
  if(v instanceof Date && !isNaN(v)) return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  if(typeof v === 'number' && isFinite(v)){ const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  if(typeof v === 'string'){ const m = v.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/); if(m) return new Date(+m[1], +m[2]-1, +m[3]); }
  return null;
}
  function msDedupeEntries(entries){
    const seen = new Set();
    const out = [];
    entries.forEach(e=>{
      const key = `${e.name}|${e.type}|${e.timeSlot}`;
      if(seen.has(key)) return;
      seen.add(key);
      out.push(e);
    });
    return out;
  }
  function parseScheduleSheet(rows, opts = {}){
    const toDate = typeof opts.excelSerialToDate === 'function' ? opts.excelSerialToDate : defaultToDate;
    const warnings = [];
    const maxCol = rows.reduce((m,r)=>Math.max(m, r?r.length:0), 0);
    const dateCell = rows[0] ? rows[0][0] : null;
    const sheetDate = toDate(dateCell);
    const weekdayChar = sheetDate ? WEEKDAY_CHARS[sheetDate.getDay()] : null;

    let mainHeaderRow = -1;
    for(let r=0;r<rows.length;r++){
      if(rows[r] && msNormText(rows[r][0])==='치료시간'){ mainHeaderRow = r; break; }
    }
    if(mainHeaderRow<0) return { entries:[], warnings:['메인 표 헤더("치료시간")를 찾지 못했습니다.'], sheetDate, weekdayChar, grid:null };

    // 평일 시간표는 "치료시간" 줄 아래(팀 구분 줄 다음)에 치료사 이름이 있고, 토요일/공휴일 시간표는
    // "치료시간" 줄에 치료사 이름이 바로 붙어 있습니다(그 다음 줄이 바로 첫 시간대).
    const sameRowHeader = !!(rows[mainHeaderRow+1] && /^\d{1,2}[:.]\d{2}/.test(msNormText(rows[mainHeaderRow+1][0])));
    const therapistRow = sameRowHeader ? mainHeaderRow : mainHeaderRow+1;
    // ERDT 같은 미니표 제목 행 = 첫 칸이 ERDT/CCRT/BETTER/COMCOG 이고 바로 아래 줄 같은 칸이 "치료시간"인 곳.
    // (평일은 빈타임 행 아래에 있고, 토요일/공휴일은 아래쪽 또는 메인 표 오른쪽 옆에 있습니다.)
    const miniTitles = [];
    for(let r0=0;r0<rows.length-1;r0++){
      const row0 = rows[r0]; if(!row0) continue;
      for(let c0=0;c0<row0.length;c0++){
        if(MS_MINI_TITLE_RE.test(msNormText(row0[c0])) && msNormText(rows[r0+1] ? rows[r0+1][c0] : '')==='치료시간') miniTitles.push({ row:r0, col:c0, title:msNormText(row0[c0]) });
      }
    }
    // 메인 표 오른쪽 옆에 붙은 미니표(제목이 메인 표 머리글 바로 윗줄)는 치료사 칸에서 제외합니다.
    const sideMiniCols = miniTitles.filter(t => t.row+1===therapistRow && t.col>0).map(t=>t.col);
    const therapistColLimit = sideMiniCols.length ? Math.min(...sideMiniCols) : maxCol;
    const therapistCols = [];
    for(let c=1;c<therapistColLimit;c++){
      const t = rows[therapistRow] ? msNormText(rows[therapistRow][c]) : '';
      if(t!=='') therapistCols.push({ col:c, name:msCleanTherapistHeader(t) });
    }

    const entries = [];
    const ERDT_E_THERAPISTS = (Array.isArray(opts.erdtTherapists) && opts.erdtTherapists.length ? opts.erdtTherapists : (Array.isArray(opts.erdtTherapists) ? [] : ['이승규','김봉선','김기범','성지현']));
    const unexpectedE = [];
    function parseMainCell(val, therapistName){
      const s = msNormText(val);
      if(!s) return null;
      // 환자 이름 없이 치료실만 적힌 칸(ERDT/CCRT…): 오더는 아니지만 미리보기에서 비워 두지 않고 표시할 수 있게 마커로 남긴다
      if(/^(10F|3F)\)?\s*(ERDT|CCRT|COMCOG|BETTER)/i.test(s)) return { skip:true, marker:s };
      if(/^(10층|3층)\s*(ERDT|CCRT|COMCOG|BETTER)/i.test(s)) return { skip:true, marker:s }; // 토요일/공휴일 시간표의 "10층 ERDT" 표기
      if(MS_MINI_TITLE_RE.test(s)) return { skip:true, marker:s }; // "ERDT"/"CCRT"만 단독으로 적힌 칸은 환자가 아니라 해당 치료실 표시
      if(/^육아휴직/.test(s)) return { skip:true };
      if(/단축\s*근무|단축|임신기|임산부/.test(s)) return { skip:true }; // 임신기 단축근무 등 선생님 근무 일정 메모 칸은 환자 오더가 아님(특수로 오인하지 않게)
      if(/퇴원|입원/.test(s) || /^\d+호/.test(s)) return { skip:true }; // 입퇴원 안내 등 관리용 메모 칸은 오더가 아님
      if(/^외래$/.test(s)) return { skip:true }; // "외래"만 단독으로 있는 칸은 환자명이 아닌 잔여 표시
      let lines = s.split('\n').map(x=>x.trim()).filter(Boolean);
      if(lines.length===0) return null;
      // "신환\n진현원TEST"처럼 첫 줄이 환자명이 아니라 "신환" 같은 안내 표시인 경우, 다음 줄을 이름 줄로 사용
      if(lines[0]==='신환' && lines.length>1) lines = lines.slice(1);
      // "3F\n홍길동CC"처럼 첫 줄이 병동(3F/10F) 표시이고 환자는 다음 줄인 경우도 같은 방식으로 병동 줄만 뺍니다.
      if(/^(3F|10F|3층|10층)$/i.test(lines[0]) && lines.length>1) lines = lines.slice(1);
      // "외래평가\n김용섭님"처럼 첫 줄이 환자명이 아니라 "외래평가"라는 유형 표시이고
      // 둘째 줄에 "님" 존칭과 함께 실제 환자명이 오는 경우: 평가로 바로 분류합니다.
      if(lines[0]==='외래평가' && lines.length>1){
        const name = lines[1].replace(/님\s*$/, '').replace(/\s+/g,'');
        if(name && !/^\d+$/.test(name)) return { name, type:'평가', raw:s };
        return { skip:true };
      }
      let line1 = lines[0];
      // "신환김기범TEST"처럼 "신환"이 줄바꿈 없이 이름 바로 앞에 붙어 있는 경우도 제거(신환자라는 뜻일 뿐 이름이 아님)
      if(line1.startsWith('신환') && line1.length>2) line1 = line1.slice(2).trim();
      const m = line1.match(/^(.*?)\s*(TEST|CCRT|CC|SM|SB|ST|CT|CM|CB|R|E)$/i);
      let name, suffix;
      if(m && m[1].trim()!==''){ name=m[1].trim(); suffix=m[2].toUpperCase(); }
      else { name=line1; suffix=null; }
      // "이정임 S\nT-7"처럼 이름 뒤에 공백+단독 S가 붙는 것도 작업특수 접미사입니다.
      // (동명이인 구분용 알파벳은 공백 없이 이름에 바로 붙으므로, 오인하지 않도록 공백이 있을 때만 인식합니다.)
      if(!suffix){
        const mS = line1.match(/^(.*?)\s+S$/);
        if(mS && mS[1].trim()!=='') { name = mS[1].trim(); suffix = 'S'; }
      }
      // "김준곤A \nSM A-10"처럼 접미사가 이름 줄이 아니라 위치 줄 맨 앞에 붙는 경우도 인식
      if(!suffix && lines.length>1){
        const m2 = lines[1].match(/^(TEST|CCRT|CC|SM|SB|ST|CT|CM|CB|R|E)\b/i);
        if(m2) suffix = m2[1].toUpperCase();
      }
      name = name.replace(/\s+/g,'');
      if(!name || /^\d+$/.test(name)) return null;
      // 위치 줄 끝에 "T-14 월수금"처럼 요일이 붙어 있으면 그 요일에만 진행되는 오더라는 뜻이므로,
      // 오늘 요일이 거기 포함되지 않으면 이 칸은 집계하지 않습니다.
      if(lines.length>1 && weekdayChar){
        const wdMatch = lines[1].match(/([월화수목금토일]{1,7})$/);
        if(wdMatch && !wdMatch[1].includes(weekdayChar)) return { skip:true };
      }
      if(suffix==='E'){
        if(ERDT_E_THERAPISTS.includes(msBaseTherapistName(therapistName))){
          return { name, type:'연하전기', raw:s };
        }
        unexpectedE.push({ name, therapist:therapistName, raw:s });
        return { skip:true };
      }
      // 접미사 없이 위치코드만 있는 칸(MSK 환자 포함)과 ST/SM/SB는 작업특수, CT/CM/CB는 드물게 나오는 복잡작업치료입니다.
      // 전산화인지(CC/CCRT) 칸에 둘째 줄이 TEST이면 그 회차는 평가입니다("홍길동 CC\nTEST").
      const ccTest = (suffix==='CC'||suffix==='CCRT') && lines.length>1 && /^TEST\b/i.test(lines[1]);
      const type = ccTest ? '평가' : (suffix==='CC'||suffix==='CCRT') ? '전산화인지' : suffix==='R' ? '연하치료' : suffix==='TEST' ? '평가' : (suffix==='CT'||suffix==='CM'||suffix==='CB') ? '복잡' : '작업특수';
      return { name, type, raw:s, ...(ccTest ? { ccrtTest:true } : {}) }; // CCRT의 TEST는 기존 인지 오더와 똑같이 입력하므로 종류 다름 비교에서는 인지로 본다
    }

    const timeRows = [];
    const markers = []; // 메인 표 안의 ERDT/CCRT 표시 칸
    let r = therapistRow+1;
    let mainEnd = rows.length;
    let hasEmptySlotRow = false; // 평일 형식: "빈타임" 행 아래에 미니표 제목 행이 옴
    for(; r<rows.length; r++){
      const c0 = msNormText(rows[r] ? rows[r][0] : null);
      if(c0==='빈타임'){ mainEnd = r; hasEmptySlotRow = true; break; }
      if(MS_MINI_TITLE_RE.test(c0)){ mainEnd = r-1; break; } // 빈타임 행이 없는 시트: 아래쪽 미니표가 시작되면 메인 표 끝
      if(c0==='점심시간'){ timeRows.push({ row:r, label:c0, lunch:true }); continue; }
      if(/^\d{1,2}[:.]\d{2}/.test(c0)){
        timeRows.push({ row:r, label:c0, lunch:false });
        therapistCols.forEach(tc=>{
          const parsed = parseMainCell(rows[r][tc.col], tc.name);
          if(parsed && !parsed.skip) entries.push({ name:parsed.name, type:parsed.type, source:'메인표', timeSlot:c0, row:r, col:tc.col, therapist:tc.name, raw:parsed.raw, ...(parsed.ccrtTest ? { ccrtTest:true } : {}) });
          else if(parsed && parsed.marker){ const m = /(ERDT|CCRT|COMCOG|BETTER)/i.exec(parsed.marker); markers.push({ row:r, col:tc.col, therapist:tc.name, timeSlot:c0, kind:m[1].toUpperCase(), label:parsed.marker.replace(/\s+/g,' ') }); }
        });
      }
    }

    const teamMarkers = [];
    if(rows[mainHeaderRow]){
      for(let c=2;c<maxCol;c++){
        const t = msNormText(rows[mainHeaderRow][c]);
        if(/^\d+팀$/.test(t)) teamMarkers.push({ col:c, label:t });
      }
    }
    const teams = teamMarkers.map((tm,i)=>{
      const endCol = (i+1<teamMarkers.length) ? teamMarkers[i+1].col-1 : maxCol-1;
      return { label:tm.label, startCol:tm.col, endCol };
    });

    const grid = { mainHeaderRow, therapistRow, therapistCols, timeRows, teams, markers };
    if(unexpectedE.length){
      const sample = unexpectedE.slice(0,6).map(u=>`${u.therapist} 담당 ${u.name}`).join(', ');
      warnings.push(`${ERDT_E_THERAPISTS.join('/')||'지정된 치료사'} 외 치료사 칸에서 단독 "E" 표시가 ${unexpectedE.length}건 발견되어 집계에서 제외했습니다 (${sample}${unexpectedE.length>6?' 등':''}).`);
    }

    // 미니표 구역: 각 구역이 자기 머리글 줄(headerRow)과 데이터 시작 줄(dataStart)을 가집니다.
    let sections = [];
    if(hasEmptySlotRow){
      // 평일 형식: 빈타임 행 바로 아래가 제목 줄(ERDT/CCRT…), 그 아래가 머리글, 그 아래부터 데이터
      const titleRow = mainEnd+1;
      if(!rows[titleRow]) return { entries: msDedupeEntries(entries), warnings, sheetDate, weekdayChar, grid };
      for(let c=0;c<maxCol;c++){
        const t = msNormText(rows[titleRow][c]);
        if(t) sections.push({ startCol:c, title:t, headerRow:mainEnd+2, dataStart:mainEnd+3 });
      }
      sections.forEach((sec,i)=>{ sec.endCol = (i+1<sections.length) ? sections[i+1].startCol-1 : maxCol-1; });
    } else {
      // 토요일/공휴일 형식: 위에서 찾은 미니표 제목 위치를 그대로 씁니다(아래쪽이든 메인 표 오른쪽 옆이든 동일).
      sections = miniTitles.map(t => ({ startCol:t.col, title:t.title, headerRow:t.row+1, dataStart:t.row+2 }));
      sections.forEach(sec=>{
        const next = sections.filter(o => o!==sec && o.headerRow===sec.headerRow && o.startCol>sec.startCol).map(o=>o.startCol);
        sec.endCol = next.length ? Math.min(...next)-1 : maxCol-1;
      });
    }

    const lastDataRow = rows.length-1;

    // ERDT/CCRT/BETTER/COMCOG 칸에 "임병덕TEST"처럼 이름 뒤에 TEST가 바로 붙어 있으면
    // 실제로는 그 회차가 평가(TEST)라는 뜻이므로 이름만 떼어내고 유형을 "평가"로 바꿉니다.
    function msStripTestSuffix(rawName){
      let s = rawName;
      if(s.startsWith('신환') && s.length>2) s = s.slice(2).trim(); // "신환김기범TEST"처럼 붙은 "신환"(신환자) 표시 제거
      const m = s.match(/^(.*?)\s*TEST$/i);
      if(m && m[1].trim()!==''){ return { name: m[1].trim().replace(/\s+/g,''), isTest:true }; }
      return { name: s.replace(/\s+/g,''), isTest:false };
    }

    sections.forEach(sec=>{
      const headerRow2 = sec.headerRow, dataStart = sec.dataStart;
      let therapistCol = null;
      for(let c=sec.startCol;c<=sec.endCol;c++){
        if(msNormText(rows[headerRow2] ? rows[headerRow2][c] : '')==='치료사'){ therapistCol=c; break; }
      }
      if(/ERDT/i.test(sec.title)){
        const slotCols = [];
        for(let c=sec.startCol;c<=sec.endCol;c++){
          if(/^S\d$/i.test(msNormText(rows[headerRow2] ? rows[headerRow2][c] : ''))) slotCols.push(c);
        }
        for(let r2=dataStart; r2<=lastDataRow; r2++){
          slotCols.forEach(c=>{
            const therapist = msCleanTherapistHeader(msNormText(rows[r2] ? rows[r2][therapistColFor(headerRow2, sec, c, therapistCol)] : ''));
            const s = msNormText(rows[r2] ? rows[r2][c] : '');
            if(!s) return;
            const lines = s.split('\n').map(x=>x.trim()).filter(Boolean);
            if(!lines[0]) return;
            const { name, isTest } = msStripTestSuffix(lines[0]);
            if(!name) return;
            if(lines.length>1 && weekdayChar && !lines[1].includes(weekdayChar)) return;
            entries.push({ name, type: isTest ? '평가' : '연하전기', source:sec.title, timeSlot: msNormText(rows[r2][sec.startCol]), row:r2, col:c, therapist, raw:s });
          });
        }
      } else if(/CCRT|BETTER|COMCOG/i.test(sec.title)){
        let targetCol = null;
        for(let c=sec.startCol;c<=sec.endCol;c++){
          if(weekdayChar && msNormText(rows[headerRow2] ? rows[headerRow2][c] : '')===weekdayChar){ targetCol=c; break; }
        }
        if(targetCol==null) return;
        for(let r2=dataStart; r2<=lastDataRow; r2++){
          const therapist = therapistCol!=null ? msCleanTherapistHeader(msNormText(rows[r2] ? rows[r2][therapistCol] : '')) : '';
          const s = msNormText(rows[r2] ? rows[r2][targetCol] : '');
          if(!s) continue;
          const { name, isTest } = msStripTestSuffix(s);
          if(!name) continue;
          entries.push({ name, type: isTest ? '평가' : '전산화인지', source:sec.title, timeSlot: msNormText(rows[r2][sec.startCol]), row:r2, col:targetCol, therapist, raw:s, ...(isTest ? { ccrtTest:true } : {}) });
        }
      }
    });

    // 미니표 슬롯 칸(S1…S8)이 속한 "치료사" 칸: ERDT 표는 S1~S4와 S5~S8이 각각 자기 "치료사" 칸을 가지므로
    // 그 칸에서 왼쪽으로 가장 가까운 "치료사" 머리글을 씁니다(없으면 구역의 첫 "치료사" 칸).
    function therapistColFor(headerRow2, sec, slotCol, firstTherapistCol){
      for(let c=slotCol;c>=sec.startCol;c--){
        if(msNormText(rows[headerRow2] ? rows[headerRow2][c] : '')==='치료사') return c;
      }
      return firstTherapistCol;
    }

    // 미니표(ERDT/CCRT/BETTER/COMCOG) 오더가 "같은 치료사·같은 시간"에 메인 표에서는
    // 전혀 다른 환자를 치료 중인 것으로 나오면, 그 치료사가 실제로는 그 시간에 미니표 환자를
    // 볼 수 없었다는 뜻이므로 "시간 충돌"로 표시하고 미액팅 집계에서 제외합니다.
    const mainGridOccupancy = {};
    entries.forEach(e=>{
      if(e.source==='메인표' && e.therapist && e.timeSlot) mainGridOccupancy[`${msBaseTherapistName(e.therapist)}|${e.timeSlot}`] = e.name;
    });
    entries.forEach(e=>{
      if(e.source==='메인표') return;
      const occupant = mainGridOccupancy[`${msBaseTherapistName(e.therapist)}|${e.timeSlot}`];
      if(occupant && occupant !== e.name) e.conflict = { withName: occupant };
    });

    return { entries: msDedupeEntries(entries), warnings, sheetDate, weekdayChar, grid };
  }
const api = { parseScheduleSheet, msNormText, msBaseTherapistName, msCleanTherapistHeader, WEEKDAY_CHARS, MS_MINI_TITLE_RE };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { otSchedule: api });
})(typeof window !== 'undefined' ? window : globalThis);
