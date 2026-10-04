# Phase 2 설계안 — 공통 데이터 모델 / Core·Data 계층

작성 2026-10-04 · 상태: **0–1단계 완료(2026-10-04)**, 2단계 이후는 제안. 0단계=`scripts/golden.js`(저장: `node scripts/golden.js save <이름>` / 비교: `compare <이름>`), 1단계=`renderer/core/xlsx-reader.js`·`normalize.js` + `main/test_core.js`. 1단계 전후 골든 비교: 그랜드라운딩 198명·언어 40명·교차검증 136건 전부 일치. 2026-09-19 초안(`PHASE2_DATA_MODEL.md`)에 Phase 3~8에서 확인한 사실을 반영한 갱신본입니다.

## 1. 왜 하는가 — 지금 상태 (실측)
| 항목 | 현재 |
|---|---|
| 도구 크기 | 그랜드라운딩 2,605줄 · 교차검증 3,809줄 · 치료기록 QA 3,107줄, 각자 단일 HTML |
| 엑셀 읽기 | `readWorkbookFile / getSheetCells / parseWorksheet / parseSharedStrings / splitRef / colToNum` 이 **그랜드라운딩과 교차검증에서 한 글자도 다르지 않은 복사본**(해시 동일). 치료기록 QA는 별도 구현 |
| 같은 파일 반복 파싱 | `작업치료현황`은 3개 도구가 각각 읽음(현황판·평일시간표·팀 시트). 전체시간표 카드는 그랜드라운딩·교차검증이 각각 파싱(결과는 일치 확인됨, 2026-09-19) |
| 규칙 중복 | 이름 정규화(`normalizeText`/`normKey`/`msNormText`), 치료 종류 분류(`treatmentCore`/`typeMap`/액팅 오더 코드), 층 판별(`detectFloor`/`ttDetectFloor`/`FILES_META`), 치료사 이름 정제(4종) |
| 테스트 방식 | 테스트가 HTML에서 함수를 **문자열 마커로 잘라** `vm`에 올림 → 마커 하나만 바뀌어도 깨짐 |
| 비용 | 새 검증 하나(예: Phase 6의 PTA 대조)를 넣을 때마다 파서·정규화·표시 규칙을 도구 안에 다시 얹어야 함 |

## 2. 목표 / 비목표
**목표** ① 엑셀을 파일당 **한 번** 읽고 모든 화면이 같은 결과를 쓴다 ② 규칙(치료 종류·층·치료사 이름·퇴원/전원·언어 판정)을 **한 곳**에 두고 테스트한다 ③ 새 검증·화면을 얹는 비용을 낮춘다.
**비목표(손대지 않음)** 서식 보존 엑셀 쓰기(그랜드라운딩 출력) · 화면 디자인 · 비즈니스 규칙 변경 · 치료기록 QA의 로봇보행 등 도메인 규칙 · 빌드 도구/프레임워크 도입.

## 3. 구조 제안
```
renderer/core/               ← 새 폴더. 브라우저(<script>)와 Node(require) 양쪽에서 쓰는 UMD 순수 함수 (sync-core.js와 같은 방식)
  xlsx-reader.js             엑셀 → {sheets, getCells(sheet)}   (현재 복사본 1개를 그대로 이동)
  normalize.js               normalizeText, normKey, normDoctor, roomDigits, normalizeTime, therapistNames
  treatment.js               TreatmentKind 표 + 분류 함수 (ot/swallow/swallow_electric/cog_computer/speech/psych/manual/…)
  rules.js                   퇴원·전원 판정, 언어치료 판정(층 우선순위), 병실 비교, 치료사 표시 규칙(책임 치료사만)
  parsers/                   파일 역할 하나당 파서 하나 → 정규화된 엔티티 배열
    status.js  cards.js  weekday.js  saturday.js  handover.js  pta.js  evalmain.js  team.js  grids.js
  data-store.js              역할별 파싱 결과 캐시 (키 = sync-core의 파일 서명) · 변경된 파일만 다시 파싱
  validation.js              공통 ValidationResult 모양 + 도구별 변환(adapter)
```
- **전달 방식**: 도구는 sandbox iframe이지만 같은 출처(`app://rehab-shell`)라 `<script src="../core/normalize.js">`로 직접 읽을 수 있습니다. 파싱 결과는 셸이 `iframe.contentWindow.__rehabData`로 심어 줍니다(이미 `__schedulesApi`로 검증한 방식). 새 IPC·번들러 불필요.
- **도구는 얇아집니다**: 도구 = (공통 데이터 읽기) + (그 도구만의 검증/표시 규칙) + (그 도구만의 내보내기).

## 4. 공통 엔티티 (현재 도구들이 이미 뽑고 있는 값의 합집합)
| 엔티티 | 핵심 필드 | 지금 어디서 | 식별/연결 |
|---|---|---|---|
| **Patient** | name, reg(등록번호), floor, category(입원/7병동/외래), room, rm, gender, age, onset | 카드(그랜드·교차) · PTA(병록#) | `patientKey = reg ? 'R:'+reg : 'N:'+normKey(name)`. 현황판·인수인계·평일시간표는 이름뿐 → 이름으로 잇되 **동명이인 의심(PTA 같은 이름 2명 이상)은 `확인 필요`로 표시** |
| **StatusRecord**(현황판) | name, room, admit(입원/재입원/외래/퇴원), dept(RM), sot/rdt/erdt/ccrt/lang 횟수, note, transfer | 교차검증 `parseStatusSheet` · 그랜드 치료사 매핑 | 이름 |
| **PtaRecord** | name, reg, room, bed, rm, rehab 코드 | 교차검증 `parsePtaSheet` | 병록# |
| **Session** | patientKey, day, time(HH:MM 0패딩), kind, location, therapist, floor, source(카드/평일/토요일) | RM 카드 칸 · 교차검증 `occ` · 액팅 시간표 | 환자×요일×시간 |
| **Therapist / Team** | name, team, kinds | 작업치료현황 `팀` 시트 · 카드 · 평일시간표 열 | 이름만(확정 규칙) |
| **HandoverRecord** | name, therapist, doctor, type(SOT/RDT/CCRT/ERDT), 작성·수정 시각, 내용 필드 | 그랜드 · 교차검증 · 뷰어(GAS) | 이름+RM |
| **Evaluation** | name, time, therapist | 평가메인 시트(볼드·중복 규칙) | 이름 |
| **ValidationResult** | id, source(cross/acting/grand), severity, category, title, message, patientKey, room, floor, therapist, time, evidence{file,sheet,row}, detail | 교차검증 `allIssues` · 액팅 `makeIssue` | — |
`detail`은 도구별 원본을 그대로 보존해 화면 회귀를 막습니다. 상세 필드 표·치료 종류 매핑표는 9/19 초안(§2~§3)을 그대로 유지합니다.

## 5. 이행 순서 (단계마다 따로 릴리스 가능 · 어느 단계에서 멈춰도 앱은 동작)
| 단계 | 내용 | 위험 | 안전망 |
|---|---|---|---|
| **0** | **골든 스냅샷**: 실데이터로 3개 도구의 출력(환자 수·이슈 목록·오류·엑셀 시트 구성)을 저장하는 스크립트 정리. 환자 이름이 든 결과는 저장소에 올리지 않고 **개수·해시만 비교** | 없음 | (이 단계가 이후 전부의 기준) |
| **1** | `xlsx-reader.js`·`normalize.js`로 **중복 함수 이동만**(동작 변경 0). 그랜드·교차검증이 복사본 대신 core를 읽음 | 낮음 | 해시가 같은 복사본이라 결과 동일해야 함 → 스냅샷 100% 일치 |
| **2** | `treatment.js` + `cards.js`: 카드 파서·치료 종류 분류를 하나로(그랜드↔교차검증) | 중간 | 198명·언어 40명·교차검증 이슈 136건 일치 확인 |
| **3** | `status/pta/handover/weekday/saturday` 파서를 core로 — 교차검증·그랜드·뷰어가 같은 결과 사용. 파서 테스트는 `vm` 마커 잘라내기 대신 `require` | 중간 | 단계 0 스냅샷 + 기존 9개 테스트 |
| **4** | `data-store.js`: 셸이 파일당 1회 파싱 후 도구들에 전달(지금 작업치료현황 3회 읽기 → 1회, 파일 바뀐 것만 재파싱) | 중간 | 자동 동기화(Phase 3) 동작 회귀 확인 |
| **5** | `validation.js`: 교차검증+액팅을 공통 ValidationResult로 → 홈·보고서·내보내기를 한 형식으로 | 낮음 | CSV/인쇄 결과 비교 |
각 단계 규모(대략): 0 작음 · 1 작음 · 2 중 · 3 큼 · 4 중 · 5 작음. **1단계까지만 해도** 가장 큰 중복(엑셀 읽기)이 사라집니다.

## 6. 선택지
| 안 | 내용 | 평가 |
|---|---|---|
| **A. 점진 추출(권장)** | 위 순서. 도구·화면 유지, core만 키움 | 회귀 위험이 단계별로 갇힘. 병원 PC에 계속 배포 가능 |
| B. 일괄 재작성 | ES module/번들러로 전체 재구성 | 깔끔하지만 3개 도구 동작 재검증 비용이 큼. 빌드 체계 신규 도입 |
| C. 현 상태 유지 | 기능 추가만 | 지금 같은 속도는 유지되나 복사본·규칙 불일치 위험이 누적 |

## 7. 결정이 필요한 것
1. **A안으로 진행해도 되는지**, 그리고 어디까지(0–1만 / 0–3 / 전체).
2. **동명이인 처리**: PTA에 같은 이름이 둘 이상이거나 카드 등록번호와 병록#이 어긋나면 `확인 필요`로 표시하는 현재 방식을 공통 규칙으로 승격해도 되는지(이름만으로 단정하지 않음).
3. **엑셀 내보내기(그랜드라운딩 서식)는 이번 범위 밖**으로 둔다는 점 확인.
4. 치료기록 QA는 엑셀 읽기 구현이 달라 **3단계 이후**에 합치는 것으로 미뤄도 되는지(기본 제안).

## 8. 이 설계로 쉬워지는 것 (앞서 드린 아이디어 중)
입원일·외래 동기화 같은 새 연계 검증, "누가 어디를 고쳐야 하나" 라벨, 수정 지시서 내보내기, 불일치 이력 추적 — 전부 4·5단계 이후에는 **파서 추가 없이 규칙만 추가**하면 됩니다.
