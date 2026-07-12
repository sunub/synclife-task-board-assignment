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
| [x] | 우선순위·상태·태그 다중 필터 | `Select` 컴포넌트는 다중 선택 UI를 지원하지만 현재 보드에서는 정렬 기준 선택에만 사용합니다. 검색과 다중 정렬은 구현했으나 우선순위·상태·태그 조건을 조합해 필터링하는 상태, 파생 로직, UI는 범위에서 제외했습니다. |

## 미구현 사유

미구현한 기능들은 단순히 시간이 부족해서 제외한 것이 아니라, 충분히 이해하지 않은 상태에서 빠르게 추가하기에는 리스크가 있다고 판단했습니다. 기능을 “구현했다”고 말하기 위해서는 해당 기능이 어떤 사용자 흐름에서 동작해야 하는지, 어떤 구현 방향을 선택할 수 있는지, 각 방식의 장단점은 무엇인지, 그리고 왜 그 방식이 현재 구조에 적합한지를 먼저 이해해야 한다고 생각했습니다.
이번 과제에서는 Priority 1에 해당하는 비동기 정합성, 낙관적 업데이트, 실패 롤백, 경쟁 상태 처리, 대량 데이터 렌더링을 더 완성도 있게 구현하는 것이 더 중요한 가치라고 판단했습니다. 그래서 Priority 2 기능 중 현재 구조 안에서 비교적 안정적으로 구현 가능한 검색 디바운싱과 복합 필터처럼, 409 충돌 처리 UX는 반영했고, 자동 재시도, 다중 탭 동기화, 키보드 카드 이동처럼 상태 설계와 UX 정책이 추가로 필요한 기능은 후속 범위로 남겼습니다.

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
