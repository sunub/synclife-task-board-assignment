# Synclife Task Board Assignment

## 배포 URL

- https://sunub.github.io/synclife-task-board-assignment/

## 실행 방법

Node.js 18 이상을 권장합니다.

```bash
npm install
npm run dev
```

개발 서버 실행 후 터미널에 표시되는 로컬 URL로 접속합니다.

검증 명령은 아래와 같습니다.

```bash
npm test
npm run build
```

GitHub Pages 서브 경로 배포를 기준으로 빌드할 때는 아래처럼 실행합니다.

```bash
VITE_BASE=/synclife-task-board-assignment/ npm run build
```

## 구현 요약

이 프로젝트는 느리고 실패할 수 있는 MSW mock API 위에서 5,000개 태스크를 다루는 칸반 보드입니다. 구현의 중심은 "사용자 조작은 즉시 반영하되, 서버 실패나 응답 순서 역전이 발생해도 최종 데이터 정합성을 지키는 것"입니다.

### 구현 방식

- 서버 응답 `Task[]`를 그대로 화면에서 반복 순회하지 않고, TanStack Query cache에 `TaskBoardModel` 형태로 정규화했습니다.
  - `byId`: id 기준 태스크 사전
  - `idsByStatus`: 컬럼별 태스크 id 목록
- 생성, 수정, 삭제, 이동은 모두 낙관적 업데이트로 먼저 UI에 반영합니다.
- 요청 실패 시 전체 5,000개 목록을 되돌리지 않고 실패한 태스크 단위로 rollback합니다.
- 이동 성공 후에도 전체 목록을 재조회하지 않고 서버가 반환한 단일 태스크만 cache에 반영합니다.
- 같은 카드를 빠르게 연속 이동하는 경우 task id별 client sequence를 비교해 오래된 응답이 최신 UI를 덮어쓰지 못하게 했습니다.
- 최신 이동 요청이 409 충돌을 받으면 서버의 최신 `version` 위에 사용자의 마지막 이동 의도를 한 번 rebase retry합니다.
- 컬럼별로 `@tanstack/react-virtual`을 적용해 5,000개 태스크를 한 번에 DOM에 렌더링하지 않습니다.
- 카드 제목은 줄 수 제한 없이 노출하고, `@chenglou/pretext`로 텍스트 높이를 예측해 동적 높이 가상화를 구성했습니다.
- 검색어 또는 정렬 기준이 바뀌면 query cache를 훼손하지 않고 화면에 보이는 id 목록만 파생해 렌더링합니다.
- CRUD는 별도 side panel form에서 처리하며, 중복 제출 방지와 삭제 확인 다이얼로그를 적용했습니다.
- 초기 로딩/에러/재시도는 Suspense, ErrorBoundary, QueryErrorResetBoundary로 분리했습니다.

## 구현 / 미구현 기능

### Priority 1

| 상태 | 기능 | 구현 내용 |
| --- | --- | --- |
| [x] | 로드 상태 처리 | Suspense fallback으로 로딩 상태를 표시하고, ErrorBoundary에서 초기 조회 실패와 다시 시도를 제공합니다. 조회 결과가 비어 있으면 빈 상태 문구를 표시합니다. |
| [x] | 낙관적 업데이트와 실패 롤백 | 이동, 생성, 수정, 삭제 모두 먼저 cache에 반영하고 실패 시 이전 태스크 또는 임시 태스크 단위로 rollback합니다. |
| [x] | 경쟁 상태 처리 | 같은 카드의 연속 이동은 client-side sequence로 오래된 성공/실패/409 응답을 무시합니다. 최신 409는 서버 최신 version 위에 한 번 재시도합니다. |
| [x] | 대량 데이터 성능 | 컬럼 단위 가상화와 Pretext 기반 카드 높이 추정으로 5,000개 태스크를 한 번에 렌더링하지 않습니다. |
| [x] | 태스크 관리 CRUD | 작업 생성, 수정, 삭제를 side panel form으로 제공합니다. 제목/우선순위/상태를 입력하고 삭제 전 confirm을 표시합니다. |
| [x] | 핵심 로직 유닛 테스트 | 정규화, 정렬, 검색, 낙관적 helper, rollback, race condition, CRUD mutation, 가상화 관련 테스트를 작성했습니다. |

### Priority 2

| 상태 | 기능 | 구현/미구현 사유 |
| --- | --- | --- |
| [x] | 409 충돌 처리 UX | 이동과 수정에서 409 payload의 서버 최신 태스크를 반영하고 안내 메시지를 표시합니다. 이동은 최신 사용자 의도를 유지하기 위해 한 번 rebase retry합니다. |
| [ ] | 실패한 요청의 일반 재시도 / 백오프 | 쓰기 실패를 자동 재시도하면 낙관적 UI와 rollback 시점이 불명확해질 수 있어 제외했습니다. 409 이동 충돌에 한해 정합성을 위한 1회 rebase retry만 구현했습니다. |
| [ ] | 다중 탭 동기화 | 과제 핵심인 단일 탭 비동기 정합성, rollback, 대량 렌더링에 우선순위를 두었습니다. BroadcastChannel 또는 storage event 기반 동기화는 후속 범위로 남겼습니다. |
| [ ] | 키보드만으로 카드 이동 | 카드와 컬럼에 접근 가능한 이름, 수정 버튼, dialog role, status announcement 등 기본 접근성은 보강했지만, 키보드 기반 카드 이동 명령은 구현하지 않았습니다. |
| [x] | 검색 디바운싱 | 검색 입력값과 실제 필터 적용값을 분리하고, `debounce`를 통해 입력이 잠시 멈춘 뒤 화면에 보이는 task id 목록을 파생하도록 처리했습니다. |
| [ ] | 우선순위·상태·태그 다중 필터 | 검색과 정렬은 구현했지만 다중 필터 UI는 범위에서 제외했습니다. 현재 데이터 모델의 태그/담당자 필드는 표시와 편집 흐름의 핵심 입력으로 사용하지 않습니다. |

## 사용 기술 스택

| 구분 | 기술 |
| --- | --- |
| Framework | React 18 |
| Language | TypeScript strict |
| Build Tool | Vite |
| Server State | TanStack Query |
| Drag and Drop | `@dnd-kit/react` |
| Virtualization | `@tanstack/react-virtual` |
| Text Layout Estimation | `@chenglou/pretext` |
| Runtime Validation | Zod |
| Mock API | MSW |
| Test | Vitest, Testing Library, jsdom |
| Notification | Sonner |
| Formatter/Linter | Biome |
