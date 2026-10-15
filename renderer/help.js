// help.js — 도움말 화면(상단 ❓ · F1 → 지금 화면 팝업의 「전체 도움말」). 처음 쓰는 사람도 볼 수 있게
// 시작하기 · 화면별 안내 · 용어 풀이 · 색 읽는 법 · 단축키 · 자주 묻는 문제를 한곳에 모았다. 단축키 표는 실제 설정(shell.js의 표)에서 만든다.
'use strict';
(function () {
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sw = (c, t) => `<span class="hp-sw" style="background:${c}"></span>${t}`;

// [id, 제목, 한 줄 설명, 본문 HTML]. 화면별 안내의 id는 도구 키(rm·acting·cross·handover)와 같게 둬서 각 화면의 ❓가 바로 그 칸으로 온다.
const SECTIONS = [
  ['start', '처음 시작하기', '새 PC에서 처음 켰을 때 — 3단계', `
    <ol class="hp-steps">
      <li><b>폴더 연결</b> — 설정 › 데이터·동기화에서 시간표·현황 파일이 들어 있는 폴더(OneDrive 등)를 연결합니다. 파일을 하나씩 올릴 필요 없이, 폴더 안에서 필요한 파일을 이름으로 알아서 찾아요.</li>
      <li><b>파일 확인</b> — 홈 위쪽의 「필수 파일 6/6」이 모두 채워졌는지 봅니다. 빨간 칩을 누르면 어떤 파일이 없는지, 직접 고르기·다시 읽기 버튼이 나와요.</li>
      <li><b>오늘 점검</b> — 홈의 「▶ 오늘 점검」(Ctrl+Shift+D)을 누르면 파일·인수인계·교차검증·치료기록 QA를 차례로 돌리고 결과를 한 창에 모아 줍니다. 아침에 한 번만 눌러도 됩니다.</li>
    </ol>
    <p class="hp-note">환자 정보가 든 파일은 설치 파일에 들어 있지 않고, 이 앱은 원본 시간표·현황·인수인계 파일을 <b>읽기만</b> 합니다(수정하지 않아요).</p>`],

  ['home', '홈', '오늘 확인할 것만 모아 보여 주는 화면', `
    <ul>
      <li><b>오늘 할 일</b> — 파일이 오래됐거나, 교차검증·치료기록 QA에서 확인할 것이 있을 때만 항목이 생깁니다. 항목마다 「바로 가기」 버튼이 있고, 작업대 배치에서는 숫자 키 1~9로도 실행됩니다.</li>
      <li><b>파일 현황</b> — 필요한 파일이 몇 개 올라와 있는지(도넛 그림). 「데이터 준비 →」로 자세히 봅니다.</li>
      <li><b>선생님별 할 일</b>(Ctrl+Shift+U) — 교차검증·치료기록 QA 결과를 담당 선생님별로 묶어 카톡에 붙일 글로 복사합니다.</li>
      <li><b>오늘 요약 복사</b>(Ctrl+Shift+T) — 오늘 상태를 짧게 정리해 복사합니다.</li>
    </ul>`],

  ['data', '데이터 준비', '어떤 파일이 있고 얼마나 최신인지', `
    <ul>
      <li>연결한 폴더에서 찾은 파일을 <b>최신 · 오래됨 · 없음 · 읽기 오류</b>로 나눠 보여 줍니다. 「🔄 지금 업데이트」(Ctrl+R)로 다시 찾습니다.</li>
      <li>기본 설정에서는 파일을 덮어써서 저장하면 <b>10~40초 안에 자동으로 반영</b>되고 알림이 뜹니다(설정 › 데이터·동기화 › 「바뀌면 바로」). 껐다 켤 필요가 없어요.</li>
      <li>파일마다 「📂 직접 고르기」(폴더 밖에 있는 파일을 지정)와 「↻ 이 파일만 다시 읽기」가 있습니다. 엑셀이 열려 있어도 읽을 수 있어요.</li>
      <li>보기 방식은 목록형 · 층별 표 · 보드형 중에서 고르고, 기본으로 쓸 방식도 정할 수 있습니다.</li>
    </ul>`],

  ['rm', '그랜드라운딩', '회진용 환자 시간표 + 인수인계(Goal·그랜드라운딩)', `
    <ul>
      <li>환자별 한 주 치료 시간표와 인수인계의 Goal·그랜드라운딩을 합쳐 <b>회진용 표 / Excel</b>로 만듭니다. 회차(설정에서 정한 병동 묶음, 예: 1회차 8·9병동 / 2회차 5·7병동)와 RM(주치의)을 고르면 그 범위만 나와요.</li>
      <li><b>치료사별 · 팀별</b>로 나눠 출력하고, <b>언어치료 대상만</b> 따로 뽑을 수도 있습니다. 출력은 Ctrl+E.</li>
      <li><b>일정 보관함</b> — 그날의 결과를 날짜별로 보관해 두었다가 여러 날짜를 한꺼번에 불러 RM·팀·언어치료 기준으로 뽑습니다.</li>
      <li><b>인수인계 검수</b>(표 위쪽 요약) — 인수인계와 현재 환자 명단을 맞춰 봅니다. 항목 뜻은 아래 「용어 풀이」를 보세요.</li>
    </ul>`],

  ['acting', '치료기록 QA', '오늘 액팅(치료 기록) 파일의 오류 · 미액팅 확인', `
    <ul>
      <li>오늘 액팅 기록 파일을 올리면(자동 불러오기 포함) 위쪽 탭 네 가지로 결과를 봅니다.</li>
      <li><b>오류 확인</b> — 기록 자체의 문제(시간·치료사·처방 표기 등)를 찾습니다.</li>
      <li><b>미액팅 오더 확인</b> — 작업치료실 시간표에는 오더가 있는데 그 시간대에 기록이 없는 칸을 찾습니다. 시간표 칸과 액팅을 가까운 시간끼리 짝지어 추정하므로 <b>추정치</b>입니다. 맞다고 확인한 칸은 제외할 수 있어요.</li>
      <li><b>회복기재활 초과</b> — 회복기재활 환자는 하루 16개까지 정상이고 17개부터 초과입니다. 환자를 누르면 그날 액팅이 시간순으로 나옵니다.</li>
      <li><b>치료사별 한눈에</b> — 같은 결과를 선생님별로 묶어 보고, 카톡 글로 복사합니다.</li>
      <li>검색은 Ctrl+F, 일일통계(D/C 명단)·삭제추가내역 등 선택 파일은 상태 띠의 「📂 직접 넣기」에서 넣습니다.</li>
    </ul>`],

  ['cross', '교차검증', '서로 다른 파일에 적힌 같은 정보가 맞는지 확인', `
    <ul>
      <li>작업치료현황(현황판) · 전체시간표 카드 · 평일시간표 · 매트·테이블현황 · 인수인계 · PTA 재원현황을 서로 맞춰 보고, <b>다르거나 빠진 것</b>을 목록으로 보여 줍니다. 위쪽 칸 6개가 종류별 건수입니다(색은 「교차검증 색 읽는 법」).</li>
      <li><b>층별 개수</b>는 목록 위의 「전체 · 10F · 3F」 칸에 그대로 보이고, 눌러서 그 층만 볼 수 있어요. 그 옆 선택칸으로 <b>변화</b>(새로 생김 · 계속 3일 이상)와, 분류를 골랐을 때 나오는 <b>세부 출처</b>를 거릅니다. 정렬(중요도 · 환자명 · 시간)은 목록 위 오른쪽입니다.</li>
      <li>같은 원인일 수 있는 항목은 목록에서 <b>한 묶음</b>으로 보여 줍니다(같은 환자의 평가메인 누락 2종 · 위치 항목들 · 같은 치료의 치료사 다름+담당 미작성). 묶음 안에도 항목이 하나하나 있어서 따로 열고 제외·확인함을 할 수 있어요.</li>
      <li>목록에서 항목을 누르면 오른쪽에 <b>어떤 파일의 어느 칸이 어떻게 다른지</b>가 나오고, 전체시간표 카드는 관련 칸 주변만 보여 줍니다(「크게 보기」로 전체).</li>
      <li><b>제외</b> — 사정이 있어 이대로가 맞는 경우 사유와 함께 빼 둡니다(건수·지시서에서 빠지고, 문제가 해소되면 자동으로 정리). <b>확인함</b> — 봤다는 표시(「확인함 숨김」으로 가릴 수 있어요). 둘 다 상세 제목 줄 오른쪽 버튼이나 <b>우클릭 메뉴</b>로 합니다.</li>
      <li><b>키보드</b> — ↑↓ 이전·다음 문제 · X 제외 · C 확인함 · Esc 상세 닫기 · Ctrl+Enter 다시 검증 · Ctrl+Shift+F 수정 지시서.</li>
      <li>위쪽 줄의 「내보내기 ▾」는 결과 복사 · Excel 저장 · 인쇄이고, 「⋯」에서 검증 기준을 볼 수 있습니다. 「해결됨 · 이력 보기」에서 어제 이후 해결된 것과 이력을 봅니다.</li>
      <li>위쪽에 「⚠ 자료가 평소와 달라요」가 뜨면 오늘 읽은 환자·카드 수가 최근과 크게 다르다는 뜻입니다. 파일이 일부만 올라왔을 수 있으니 결과를 믿기 전에 파일부터 확인하세요.</li>
    </ul>`],

  ['handover', '인수인계', '인수인계서(통합)를 보고 · 검색하고 · 수정', `
    <ul>
      <li>OT 인수인계서(통합)의 환자 기록을 목록·검색·정렬로 봅니다(이름 검색 Ctrl+F 또는 F2, 새로고침 Ctrl+R, 새 환자 Ctrl+N).</li>
      <li>인수인계는 인터넷에서 가져옵니다. 인터넷이 막히면 마지막으로 가져온 값을 쓰고, 오래되면 노랑·빨강으로 알려 줘요. 지금 다시 가져오려면 Ctrl+Shift+H.</li>
      <li>그랜드라운딩·교차검증의 인수인계 검수는 이 기록을 기준으로 합니다.</li>
    </ul>`],

  ['report', '보고서 / 출력 · 백업 · 설정', '나머지 화면', `
    <ul>
      <li><b>보고서 / 출력</b> — 각 도구가 이미 분석해 둔 내용을 이 화면에서 바로 내보냅니다(그랜드라운딩 Excel, 교차검증 결과 등). 아직 한 번도 안 연 도구는 먼저 열어 파일을 불러와야 해요. 내보낸 파일은 기본으로 다운로드 폴더에 저장됩니다(설정 › 파일 저장에서 변경).</li>
      <li><b>백업 상태</b> — 백업이 최근에 잘 됐는지 확인합니다. 홈에 「백업 확인」이 뜨면 여기서 원인을 봐요.</li>
      <li><b>설정</b> — 폴더·동기화, 화면, 도구별 옵션, 단축키, 잇다 연동, 백업·관리, 업데이트. 위쪽 검색창으로 설정 이름을 찾을 수 있습니다.</li>
    </ul>`],

  ['search', '환자 빠른 검색 (Ctrl+K)', '어느 화면에서든 환자 한 명을 바로 찾기', `
    <ul>
      <li>이름(또는 병실 번호)을 치면 <b>전체시간표 카드를 크게</b>, 오른쪽에 <b>오늘 일정 · 인수인계 · 교차검증 · 치료기록 QA</b>가 한 화면에 나옵니다.</li>
      <li>카드에는 <b>오늘 요일 열</b>이 연한 파란색으로, <b>지금 진행 중인(없으면 다음) 치료 칸</b>이 파란 테두리로 표시됩니다.</li>
      <li>Enter를 누르면 카드를 크게 보거나 해당 화면으로 이동합니다(설정 › 화면에서 선택). Esc 또는 닫기로만 닫혀요.</li>
    </ul>`],

  ['terms', '용어 풀이', '화면에 나오는 말들의 뜻', `
    <dl class="hp-dl">
      <dt>미액팅</dt><dd>시간표에는 오더가 있는데 그 시간대 액팅(치료 기록)이 없는 것. 시간이 가까운 것끼리 짝지어 추정합니다.</dd>
      <dt>액팅 초과</dt><dd>오더(시간표 칸)보다 액팅이 더 많은 것.</dd>
      <dt>종류 다름</dt><dd>시간표는 인지(CCRT)인데 특수로 액팅한 것처럼, 오더와 다른 종류로 기록한 것. 그 시간 칸에 치료는 한 것으로 보고 미액팅에서는 빼 줍니다.</dd>
      <dt>D/C인데 액팅</dt><dd>일일통계 D/C(치료 중단) 명단에 있는 환자·선생님·치료 종류로 액팅이 남은 것.</dd>
      <dt>회복기재활 초과</dt><dd>회복기재활 환자의 하루 액팅이 16개를 넘은 것(17개부터).</dd>
      <dt>미반영 · 확인 필요</dt><dd>인수인계에는 있는데 현재 환자 명단에 없는 환자. 퇴원·전원했는지 확인하세요(다른 회차 환자는 포함하지 않아요).</dd>
      <dt>미등록</dt><dd>현재 환자인데 인수인계에 기록이 아예 없는 것.</dd>
      <dt>RM 오기입 의심</dt><dd>인수인계 기록의 RM(주치의)이 환자의 실제 RM과 다르게 적힌 것. 환자는 입원 중이니 RM만 고치면 됩니다.</dd>
      <dt>전체 공란 · 일부 미작성</dt><dd>인수인계 줄은 있지만 Goal·그랜드라운딩이 모두 비었거나(전체 공란), 치료 종류별로 한쪽만 빈 것.</dd>
      <dt>제외 / 확인함</dt><dd>제외 = 사유를 적고 목록에서 빼기(해소되면 자동 정리). 확인함 = 봤다는 표시만 하고 목록에는 남김.</dd>
      <dt>파일 상태</dt><dd>최신 = 오늘 것 · 오래됨 = 갱신이 필요 · 없음 = 못 찾음 · 읽기 오류 = 열었지만 내용을 못 읽음.</dd>
    </dl>`],

  ['colors', '교차검증 색 읽는 법', '목록의 점·꼬리표 색 = 위쪽 칸의 색', `
    <p>교차검증 목록에서 환자 이름 옆 점과 꼬리표는 <b>위쪽 6개 칸과 같은 색</b>입니다. 세부 판정(예: 「시간표 담당 미작성」)은 글자로 구분하고, 색은 그 종류 색을 따릅니다.</p>
    <table class="hp-tbl">
      <tr><td>${sw('#d4606c', '개수')}</td><td>현황판의 치료 횟수와 실제 시간표 횟수가 다름, 현황판에 없는 외래 카드, 퇴원처리 누락</td></tr>
      <tr><td>${sw('#6f94e3', '위치')}</td><td>전체시간표 카드의 자리(매트·테이블 칸)가 매트·테이블현황 또는 평일시간표와 다름</td></tr>
      <tr><td>${sw('#c9a23c', '치료사')}</td><td>카드의 담당 치료사가 평일시간표와 다름</td></tr>
      <tr><td>${sw('#4fa9a5', '인수인계')}</td><td>인수인계 기록 없음 · Tx/RM/작성자 미작성 · 치료사·주치의 다름 · 작성자 초과 · 시간표 담당 미작성</td></tr>
      <tr><td>${sw('#7c87bd', '평가메인')}</td><td>평가메인 시트에 환자가 없거나 초과, 이름 중복</td></tr>
      <tr><td>${sw('#4f9ea2', 'PTA 대조')}</td><td>병실·주치의(RM)가 PTA 재원현황과 다름</td></tr>
    </table>`],

  ['keys', '단축키', 'Alt 키를 길게(또는 두 번) 누르면 언제든 이 표가 뜹니다', null],

  ['faq', '자주 묻는 문제', '막혔을 때 먼저 볼 것', `
    <dl class="hp-dl">
      <dt>파일이 안 읽혀요</dt><dd>홈의 「필수 파일」 칩을 눌러 파일별 상태를 봅니다. 「📂 직접 고르기」로 파일을 지정하거나 「↻ 이 파일만 다시 읽기」를 눌러 보세요. 그래도 안 되면 설정 › 업데이트·정보 › 환경 점검 › 「점검 실행」으로 이 PC에서 폴더·파일을 읽을 수 있는지 확인합니다.</dd>
      <dt>파일을 덮어썼는데 반영이 안 돼요</dt><dd>저장이 끝난 뒤 10~40초 기다려 보세요. 설정에서 「바뀌면 바로」가 꺼져 있다면 「🔄 불러오기」를 누릅니다. 직접 끌어다 올린 파일은 자동으로 다시 읽지 않으니 다시 올려야 해요.</dd>
      <dt>「OneDrive 꺼짐」이라고 떠요</dt><dd>OneDrive 프로그램이 꺼져 있다는 뜻입니다. 작업 표시줄에서 켜세요. 「OneDrive 확인」(노랑)은 파일이 아직 내려받아지지 않았을 수 있다는 안내입니다.</dd>
      <dt>인수인계가 오래된 값이에요</dt><dd>상단 또는 도구 위의 「인수인계」 칩(Ctrl+Shift+H)으로 지금 다시 가져옵니다. 인터넷이 막혀 있으면 마지막 값을 보여 줍니다.</dd>
      <dt>교차검증 결과가 갑자기 너무 많거나 적어요</dt><dd>「⚠ 자료가 평소와 달라요」가 떠 있는지 보세요. 파일이 동기화 중이거나 일부만 올라온 경우가 많습니다. 파일을 확인하고 「다시 검증」(Ctrl+Enter)을 누르세요.</dd>
      <dt>업데이트하면 하던 작업이 사라지나요</dt><dd>아니요. 설정, 제외·확인함, 메모, 보관함은 이 PC에 저장돼 있고, 업데이트로 다시 켜지면 하던 화면으로 돌아옵니다. 직접 끌어다 올린 파일이 있으면 설치를 미루고 프로그램을 끌 때 설치합니다.</dd>
      <dt>「업데이트 실패」가 빨갛게 떠요</dt><dd>설정 › 업데이트·정보에 <b>실패한 이유</b>가 한 문장으로, 그 아래에 해결 방법이 한 줄로 나옵니다(예: 인터넷에 연결되어 있지 않음 · GitHub에서 응답 없음 · 보안 인증서 오류 · 파일을 저장하지 못함). 원래의 영어 오류 내용은 글자 위에 마우스를 올리거나 「기록 파일」에서 볼 수 있어요. 병원망이라 외부 접속이 막혀 있으면 인터넷이 되는 곳에서 설치 파일을 받아 설치하면 됩니다.</dd>
      <dt>앱이 멈추거나 흰 화면이에요</dt><dd>잠시 기다리면 자동으로 다시 불러옵니다. 계속되면 앱을 완전히 종료하고 다시 실행하세요. 문제를 알릴 때는 설정 › 업데이트·정보의 「데이터 저장 위치」 폴더에 있는 error.log 맨 아래 몇 줄을 함께 보내 주세요.</dd>
      <dt>새 PC로 옮기려면요</dt><dd>옛 PC에서 설정 › 관리·백업 › 「설정 내보내기」, 새 PC에서 「설정 가져오기」. 그랜드라운딩 보관함 등 이 PC에만 있는 자료는 앱 데이터 폴더째 복사해야 옮겨집니다.</dd>
    </dl>`],
];

let q = '';
function keysHtml() {
  try {
    const rows = (list) => list.map((x) => `<tr><td>${esc(x.label)}</td><td><kbd>${esc(keyLabel(effKeys(x)))}</kbd></td></tr>`).join('');
    const names = { home: '홈', data: '데이터 준비', rm: '그랜드라운딩', acting: '치료기록 QA', cross: '교차검증', handover: '인수인계' };
    return `<table class="hp-tbl hp-keys">${rows(GLOBAL_KEYS)}</table>` + Object.keys(VIEW_KEYS).map((v) => (VIEW_KEYS[v] || []).length ? `<div class="hp-sub">${esc(names[v] || v)} 화면에서</div><table class="hp-tbl hp-keys">${rows(VIEW_KEYS[v])}</table>` : '').join('')
      + '<p class="hp-note">단축키는 설정 › 단축키에서 바꾸거나 끌 수 있어요.</p>';
  } catch (e) { return '<p class="hp-note">설정 › 단축키에서 전체 목록을 볼 수 있어요.</p>'; }
}
function render() {
  const body = document.getElementById('helpBody'); if (!body) return;
  const needle = q.trim().toLowerCase();
  const secs = SECTIONS.map(([id, title, sub, html]) => ({ id, title, sub, html: html == null ? keysHtml() : html }));
  const shown = needle ? secs.filter((s) => (s.title + ' ' + s.sub + ' ' + s.html.replace(/<[^>]+>/g, ' ')).toLowerCase().includes(needle)) : secs;
  // 검색창은 한 번만 만들고 아래 목록만 다시 그린다(글자를 칠 때마다 입력칸을 새로 만들면 한글 입력이 끊겨요)
  if (!body.querySelector('#helpSearch')) body.innerHTML = '<div class="hp-top"><h2>❓ 도움말</h2><input type="search" id="helpSearch" placeholder="궁금한 말 검색 (예: 미액팅, 제외, 단축키)"></div><div id="helpList"></div>';
  const inp = document.getElementById('helpSearch'); if (inp.value !== q) inp.value = q;
  document.getElementById('helpList').innerHTML = (needle ? '' : `<div class="hp-toc">${secs.map((s) => `<a href="#" data-help-go="${s.id}">${esc(s.title)}</a>`).join('')}</div>`)
    + (shown.length ? shown.map((s) => `<section class="card hp-sec" id="hp-${s.id}"><h3>${esc(s.title)}<small>${esc(s.sub)}</small></h3>${s.html}</section>`).join('') : '<div class="card hp-none"><p class="muted">찾는 말이 없어요. 다른 말로 검색해 보세요.</p></div>')
    + '<p class="hp-foot">그래도 막히면 만든 사람에게 화면 캡처와 함께 알려 주세요. 설정 › 업데이트·정보에서 현재 버전과 오류 기록 위치를 볼 수 있습니다.</p>';
}
// 도움말 열기: 기본은 「지금 보고 있는 화면」의 도움말만 작은 팝업으로 보여 준다(F1·상단 ❓). 전체는 팝업 안의 「전체 도움말」에서.
const VIEW_SEC = { home: 'home', data: 'data', rm: 'rm', acting: 'acting', cross: 'cross', handover: 'handover', report: 'report', backup: 'report', settings: 'report' };
let pop = null;
function closePop() { if (pop) { pop.remove(); pop = null; } }
function openPop(id) {
  closePop();
  const sec = SECTIONS.find((x) => x[0] === id) || SECTIONS[0]; const html = sec[3] == null ? keysHtml() : sec[3];
  pop = document.createElement('div'); pop.className = 'hp-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '도움말');
  pop.innerHTML = `<div class="hp-pop-h"><b>❓ ${esc(sec[1])}</b><small>${esc(sec[2])}</small><button type="button" class="hp-x" data-help-close aria-label="닫기">✕</button></div><div class="hp-pop-b hp-sec">${html}</div>`
    + `<div class="hp-pop-f"><button type="button" class="btn" data-help-page="${id}">📖 전체 도움말 · 용어 풀이</button><span>Esc로 닫기</span></div>`;
  document.body.appendChild(pop);
}
// section: 도움말 칸 id 또는 도구 키(없으면 지금 화면). 도움말 화면이 이미 열려 있으면 그 칸으로 이동한다.
window.__openHelp = function (section) {
  const v = (document.querySelector('.view.active') || {}).dataset ? document.querySelector('.view.active').dataset.view : '';
  const id = section && section !== 'here' && section !== 'start' ? section : (VIEW_SEC[v] || 'start');
  if (v === 'help') { const el = document.getElementById('hp-' + id); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  openPop(id);
};
window.__openHelpPage = function (section) {
  closePop(); q = ''; showView('help'); render();
  if (section) setTimeout(() => { const el = document.getElementById('hp-' + section); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30);
};
window.__helpPopOpen = () => !!pop;
window.__renderHelp = render;
document.addEventListener('input', (e) => { if (e.target && e.target.id === 'helpSearch') { q = e.target.value; render(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) { closePop(); e.stopPropagation(); } }, true);
document.addEventListener('click', (e) => {
  const pg = e.target.closest('[data-help-page]'); if (pg) { window.__openHelpPage(pg.dataset.helpPage); return; }
  if (e.target.closest('[data-help-close]')) { closePop(); return; }
  const g = e.target.closest('[data-help-go]'); if (g) { e.preventDefault(); const el = document.getElementById('hp-' + g.dataset.helpGo); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  const b = e.target.closest('[data-help]'); if (b) { e.stopPropagation(); window.__openHelp(b.dataset.help); return; }
  if (pop && !e.target.closest('.hp-pop')) closePop();
});
})();
