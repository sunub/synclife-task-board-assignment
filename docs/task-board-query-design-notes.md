# Task Board Query Design Discussion

이 문서는 `Board.tsx`의 비동기 데이터 흐름을 TanStack Query 기반으로 개선하기 전에 진행한 설계 토론을 정리한다. 단순한 결론 목록이 아니라, 초기 설계의 문제점, 사용자가 지적한 반박 지점, 논의 후 얻은 결정과 기대 결과가 구분되어 보이도록 기록한다.

## 1. 논의의 출발점

현재 `Board.tsx`는 `useEffect` 안에서 `getTasks()`를 직접 호출하고 `loading` 상태를 내부에서 관리한다. 또한 카드 드래그는 서버 저장 없이 로컬 state만 변경한다.

개선 목표는 다음과 같았다.

- 초기 로드의 pending/error 처리는 `App.tsx`의 `Suspense`와 `ErrorBoundary`에 위임한다.
- `Board.tsx`는 데이터를 동기적으로 받은 것처럼 작성한다.
- 카드 이동은 `useMutation`으로 서버에 저장한다.
- 실패 시 rollback하고, 같은 카드를 빠르게 연속 이동할 때 오래된 응답이 최신 상태를 덮지 못하게 한다.

초기 구상은 mutation 성공 후 이전 컬럼과 이동 후 컬럼의 query cache를 `invalidateQueries`로 갱신하는 방식이었다.

## 2. 초기 설계의 문제점

### 2.1 `invalidateQueries` 중심 흐름의 문제

초기 흐름은 다음과 같았다.

1. 카드 드래그 시 mutation 호출
2. 서버에서 task 정보 업데이트
3. 서버가 수정 완료된 task 반환
4. `onSuccess` 실행
5. 이동 전 컬럼 cache invalidate
6. 이동 후 컬럼 cache invalidate
7. 해당 query를 구독하는 컴포넌트가 다시 렌더링

이 흐름은 일반적인 서버 상태 동기화로는 자연스럽지만, 현재 과제 조건에서는 비효율적이다.

현재 API는 컬럼별 조회가 아니라 `GET /api/tasks` 단일 전체 조회만 제공한다. 따라서 `invalidateQueries(['tasks'])`를 기본 성공 경로로 사용하면 단일 카드 변경에도 5,000개 전체 데이터를 다시 요청하고, 파싱하고, cache에 반영할 수 있다.

이 문제는 데이터가 500,000개처럼 커질 경우 더 커진다. 네트워크 수신 비용, 큰 배열 처리 비용, 구독 컴포넌트의 파생 계산 비용이 모두 커진다.

### 2.2 `Task[]` 단일 cache의 문제

처음에는 API가 전체 `Task[]`만 반환하므로 `['tasks']` query key에 `Task[]`를 그대로 저장하는 방식을 고려했다.

하지만 이 방식도 한계가 있다.

- 단일 task 변경에도 `tasks.map(...)`으로 전체 배열을 순회한다.
- 컬럼별 데이터를 만들기 위해 매번 `filter` 또는 status별 분류 작업이 필요하다.
- 큰 배열을 query data로 구독하는 컴포넌트가 많아질수록 렌더와 파생 계산 비용이 커진다.
- 전체 스냅샷 rollback은 실패한 단일 task보다 훨씬 큰 범위를 되돌릴 위험이 있다.

즉 API가 단일 전체 조회인 것과, 클라이언트 내부에서도 계속 큰 배열을 직접 조작해야 하는 것은 별개의 문제다.

## 3. 사용자가 지적한 핵심 쟁점

### 3.1 단일 cache key가 대량 데이터에서 병목이 될 수 있다는 지적

사용자는 `['tasks']` 단일 cache key를 쓰는 것이 현재 5,000개에서는 괜찮아 보여도 500,000개에서는 문제가 되지 않느냐고 지적했다.

이 지적을 통해 성능 문제를 세 가지로 분리했다.

- 전체 재조회 비용: `invalidateQueries(['tasks'])`가 큰 데이터를 다시 fetch, parse, cache write 하는 비용
- 배열 갱신 비용: `setQueryData(['tasks'])`에서도 단일 변경을 위해 큰 배열을 순회하는 비용
- 구독과 렌더 비용: 큰 배열을 구독하는 컴포넌트들이 status별 파생 계산과 렌더링을 반복하는 비용

논의 결과, 단일 API 제약 때문에 최초 네트워크 수신 단위는 줄일 수 없지만, 클라이언트 내부 read model은 개선할 수 있다고 판단했다.

### 3.2 TanStack Query만으로 충분한지에 대한 의문

사용자는 SSR이나 TanStack Query 바깥의 방법까지 포함해, 단일 API 제약 안에서 더 나은 구조가 없는지 물었다.

이에 대해 다음과 같이 정리했다.

- SSR은 최초 로딩 체감에는 도움이 될 수 있지만, 브라우저에서 5,000개 또는 500,000개 데이터를 보관하고 mutation 후 UI를 갱신하는 비용을 해결하지 않는다.
- Web Worker는 최초 normalize, 검색, 필터, 정렬 같은 연산을 메인 스레드 밖으로 옮길 수 있지만, 데이터 모델 자체를 개선하지는 않는다.
- 별도 store를 둘 수 있지만, TanStack Query와 store의 동기화 규칙이 복잡해진다.
- 가장 적절한 방향은 TanStack Query cache의 data shape 자체를 보드 UI에 맞는 read model로 변환하는 것이다.

이 논의에서 `TaskBoardModel`이라는 normalized query cache 방향이 도출되었다.

### 3.3 컬럼 내부 수동 정렬의 의미에 대한 지적

초기에는 카드가 다른 컬럼으로 이동하면 도착 컬럼의 맨 뒤에 들어가는 정책을 제안했다. 이에 대해 사용자는 실제 칸반 UX에서는 특정 위치에 드롭하면 그 위치에 끼워지는 것이 더 자연스럽지 않느냐고 지적했다.

이 지적을 통해 `status` 변경과 컬럼 내부 수동 정렬이 서로 다른 도메인 개념임을 분리했다.

- `status`: task가 어느 컬럼에 속하는지
- `position`, `order`, `rank`: 같은 컬럼 안에서 어느 순서로 보이는지

현재 `Task` 타입에는 `status`는 있지만 `position`, `order`, `rank`가 없다.

따라서 현재 API로는 컬럼 간 이동은 영속화할 수 있지만, 컬럼 내부에서 사용자가 지정한 수동 순서는 서버에 올바르게 저장할 수 없다.

### 3.4 `updatedAt` 정렬과 수동 이동의 충돌 지적

사용자는 기본 정렬이 최근 업데이트 날짜 기준이라면, 사용자가 최신 task를 같은 컬럼 안에서 아래로 내리는 행위의 의미가 무엇인지 정의해야 한다고 지적했다.

이 지적은 중요한 도메인 모델링 문제다.

`updatedAt`은 "데이터가 마지막으로 변경된 시각"이다. 반면 사용자가 카드를 위아래로 옮기는 행위는 "보드에서 보고 싶은 상대적 우선순위" 또는 "작업 진행 순서"에 가깝다.

따라서 `updatedAt`을 수동 순서처럼 사용하는 것은 부적절하다. 사용자가 카드를 아래로 내렸다고 해서 그 task가 덜 최근에 수정된 것은 아니기 때문이다.

합의된 문제 정의는 다음과 같다.

> 현재 `Task` 모델의 `updatedAt`은 데이터가 마지막으로 변경된 시각을 의미한다. 하지만 칸반 보드에서 사용자가 카드를 위아래로 이동하는 행위는 표시 우선순위 또는 작업 진행 순서를 의미한다. 이 둘은 서로 다른 도메인 개념이며, 현재 API에는 표시 우선순위를 영속화할 필드가 없다.

## 4. 논의 결과 얻은 설계 결정

### 4.1 Query data shape은 `TaskBoardModel`로 둔다

서버 API는 계속 `Task[]` 전체를 반환한다. 하지만 TanStack Query cache에는 서버 응답을 그대로 저장하지 않고, 보드 UI가 읽기 좋은 형태로 변환해서 저장한다.

```ts
type TaskBoardModel = {
  byId: Record<string, Task>
  idsByStatus: Record<Status, string[]>
}
```

이 이름은 단순한 normalization 구조가 아니라 보드 렌더링과 mutation 처리에 맞춘 클라이언트 read model이라는 의미를 담는다.

기대 결과:

- 단일 task 조회는 `byId[id]`로 접근한다.
- 컬럼별 렌더 순서는 `idsByStatus[status]`로 접근한다.
- mutation 성공 시 서버가 반환한 단일 `Task`만 cache에 반영한다.
- rollback도 전체 목록이 아니라 실패한 task 단위로 수행한다.

### 4.2 성공 경로에서 `invalidateQueries`를 기본으로 사용하지 않는다

서버는 PATCH 성공 시 수정된 `Task`를 반환한다. 따라서 성공 경로에서는 전체 재조회가 아니라 `setQueryData`로 `TaskBoardModel`을 직접 갱신한다.

사용할 helper의 역할은 다음과 같다.

- `normalizeTasks(tasks)`: 서버 응답 `Task[]`를 `TaskBoardModel`로 변환
- `moveTaskOptimistically(model, id, status)`: 사용자 이동을 즉시 반영
- `applyServerTask(model, task)`: 서버가 반환한 최신 task를 반영
- rollback: `previousTask`를 `applyServerTask`로 되돌림

기대 결과:

- 단일 카드 이동 때문에 전체 데이터를 다시 fetch하지 않는다.
- 대량 데이터에서 불필요한 네트워크와 파싱 비용을 줄인다.
- 실패 범위를 단일 task로 제한한다.

### 4.3 컬럼 내부 수동 순서는 영속 기능으로 제공하지 않는다

현재 API에서 영속 가능한 드래그 의미는 `status` 변경이다. 컬럼 내부 수동 순서는 `Task` 모델에 표현할 필드가 없으므로 서버 정합성의 대상으로 삼지 않는다.

결정:

- 컬럼 간 이동은 `updateTask(id, { status, version })`로 서버에 저장한다.
- 컬럼 내부 수동 순서는 현재 구현 범위에서 제외한다.
- 향후 제품 요구사항으로 수동 순서가 필요하면 서버 계약에 `position` 또는 `rank` 필드를 추가해야 한다.

기대 결과:

- 서버가 표현하지 못하는 순서를 프론트엔드가 영속되는 것처럼 꾸미지 않는다.
- 새로고침, 전체 재조회, 충돌 복구 후에도 설명 가능한 정합성을 유지한다.
- 과제의 핵심인 낙관적 업데이트, rollback, race condition 처리에 집중한다.

### 4.4 컬럼 내부 표시 순서는 자동 정렬 정책으로 고정한다

정렬 정책은 다음 순서로 고정한다.

1. `updatedAt desc`
2. `createdAt desc`
3. `id asc`

`TaskBoardModel`의 불변식은 다음과 같다.

```ts
// idsByStatus[status] is always sorted by:
// updatedAt desc, createdAt desc, id asc
```

정렬은 렌더 직전에 반복 수행하지 않고, `normalizeTasks()`, `applyServerTask()`, `moveTaskOptimistically()` 같은 model helper가 항상 유지한다.

기대 결과:

- 렌더 단계에서 컬럼별 정렬 비용을 반복하지 않는다.
- 테스트 가능한 결정적 순서를 보장한다.
- `updatedAt`을 "최근 변경된 작업을 먼저 보여주는 자동 정렬 기준"으로만 사용하고, 수동 순서와 혼동하지 않는다.

### 4.5 Client-side mutation sequence를 둔다

같은 카드를 빠르게 연속 이동할 때, 늦게 도착한 오래된 요청의 성공/실패가 최신 사용자 의도를 덮으면 안 된다.

서버의 `version`은 서버 동시성 제어용이고, 클라이언트에서 어떤 요청이 최신 사용자 의도인지를 구분하지 못한다. 따라서 task id별 client-side sequence를 둔다.

```ts
type MoveContext = {
  taskId: string
  sequence: number
  previousTask?: Task
}
```

정책:

- mutation 시작 시 task id별 sequence를 증가시킨다.
- success/error/409 처리 시 context의 sequence가 현재 task의 최신 sequence인지 확인한다.
- 오래된 sequence의 응답은 최신 UI 상태를 덮지 않도록 무시한다.

기대 결과:

- 같은 카드의 빠른 연속 이동에서 오래된 응답이 최신 UI 상태를 덮지 못하게 한다.
- 첫 번째 요청 실패가 두 번째 이동 결과를 rollback하지 못한다.
- 오래된 성공 응답도 최신 사용자 의도를 덮지 못한다.
- 단, 서버가 이전 요청을 먼저 성공 처리해 `version`을 올린 뒤 최신 요청이 409를 받는 경우까지 last-write-wins로 만들려면 4.7의 rebase retry가 함께 필요하다.

### 4.6 Optimistic move에서도 `updatedAt`을 임시 갱신한다

서버는 PATCH 성공 시 task의 `updatedAt`을 현재 시각으로 갱신한다. 따라서 사용자가 카드를 이동하는 순간의 optimistic UI도 최종 서버 응답과 같은 방향으로 보이도록 `updatedAt`을 임시로 갱신한다.

결정:

- `moveTaskOptimistically`는 status와 함께 `updatedAt`을 클라이언트 시각으로 갱신한다.
- 테스트에서는 현재 시각을 함수 인자로 주입하여 정렬 결과를 결정적으로 검증한다.
- 서버 성공 시에는 `applyServerTask`가 서버가 반환한 `updatedAt`으로 optimistic 값을 확정한다.
- 서버 실패 시에는 `previousTask`를 다시 반영하여 status와 `updatedAt`을 함께 rollback한다.

기대 결과:

- 이동 직후에도 자동 정렬 정책(`updatedAt desc -> createdAt desc -> id asc`)과 화면 결과가 일관된다.
- 서버 성공 후 카드 위치가 갑자기 다시 튀는 현상을 줄인다.
- 시간 의존 로직을 테스트 가능한 순수 함수 경계 안에 둔다.

### 4.7 최신 이동 요청의 409는 서버 version 위에 rebase retry한다

409 처리도 요청 sequence를 먼저 확인한다.

- 오래된 요청의 409는 무시한다.
- 최신 요청의 409만 처리한다.
- `ApiError.payload.current`에 담긴 서버 최신 task를 `TaskBoardModel`에 반영해 클라이언트 기준점을 서버와 맞춘다.
- 서버 최신 task의 `status`가 사용자의 마지막 target status와 다르고 아직 rebase retry를 하지 않았다면, 같은 target status를 `current.version`으로 한 번 더 PATCH한다.
- rebase retry가 성공하면 서버가 반환한 task를 `applyServerTask`로 확정한다.
- rebase retry까지 409가 발생하거나 서버 최신 task가 이미 target status와 같다면, 서버 최신 상태를 반영하고 사용자에게 충돌로 인해 서버 상태를 반영했다는 피드백을 제공한다.

이 정책이 필요한 이유는 sequence만으로는 응답 순서 문제만 막을 수 있기 때문이다. 예를 들어 첫 번째 이동 요청이 서버에서 먼저 성공해 `version`을 올리고, 두 번째 최신 이동 요청이 오래된 `version`으로 409를 받으면, 서버 `current`를 그대로 반영하는 순간 사용자의 마지막 이동 의도가 사라진다. 따라서 최신 이동 요청의 409는 "서버 최신 version 위에 마지막 의도를 다시 얹는" 재시도 경로가 필요하다.

기대 결과:

- 서버 정합성은 `version`으로 지키고, 클라이언트의 최신 이동 의도는 sequence와 rebase retry로 지킨다.
- 같은 task의 연속 이동에서 이전 요청이 서버 version을 먼저 올려도 마지막 target status가 서버에 다시 시도된다.
- 무한 재시도를 피하기 위해 rebase retry는 한 번만 수행한다.

### 4.8 Mutation 피드백은 `Board.tsx`의 transient notice로 둔다

초기 loading/error는 `Suspense`와 `ErrorBoundary`가 담당한다. 반면 mutation 실패, rollback, 409 충돌 같은 사용자 액션 결과는 서버 상태가 아니라 UI 이벤트에 가깝다.

따라서 `Board.tsx` 내부에 가벼운 notice state를 둔다.

예상 메시지:

- 이동 실패: "이동에 실패해 이전 상태로 되돌렸습니다."
- 409 충돌: "다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다."

기대 결과:

- `Board.tsx` 내부에서 query pending/error 분기를 반복하지 않는다.
- 사용자 액션 결과는 명확히 피드백한다.
- 전역 toast 시스템 같은 추가 복잡도를 만들지 않는다.

### 4.9 검색/필터는 `TaskBoardModel`이 아니라 selector가 담당한다

`TaskBoardModel`은 전체 task의 canonical client read model로 유지한다. 검색어, priority, tag 같은 화면 조건은 서버 상태가 아니라 UI 상태이므로 query cache data shape에 섞지 않는다.

결정:

- `TaskBoardModel`은 `byId`와 `idsByStatus`만 가진다.
- `idsByStatus`는 전체 task 기준의 정렬 불변식을 유지한다.
- 검색/필터 결과는 별도 selector가 `idsByStatus`의 순서를 유지하면서 계산한다.
- 필터 조건 변경은 query cache를 수정하지 않는다.

기대 결과:

- mutation helper가 검색/필터 조건을 몰라도 된다.
- 검색/필터 로직을 순수 함수로 테스트할 수 있다.
- query cache는 서버 상태의 보드용 read model로 남고, 화면 조건은 view model 단계에서 분리된다.

## 5. 이 논의로 얻은 최종 결과

이 토론을 통해 단순히 "TanStack Query로 바꾼다"가 아니라, 현재 API 제약에서 무엇을 보장하고 무엇을 보장하지 않을지 분리했다.

최종적으로 얻은 결과는 다음과 같다.

- 단일 API 제약은 인정하되, 클라이언트 내부 read model은 `TaskBoardModel`로 개선한다.
- `invalidateQueries` 중심 흐름 대신 mutation 응답 기반 `setQueryData` 갱신을 기본으로 한다.
- 컬럼 간 이동은 서버에 영속되는 `status` 변경으로 정의한다.
- 컬럼 내부 수동 정렬은 현재 API가 표현하지 못하므로 영속 기능으로 제공하지 않는다.
- `updatedAt`은 수동 순서가 아니라 자동 정렬 기준으로 사용한다.
- optimistic move에서도 서버 성공 결과와 맞추기 위해 `updatedAt`을 임시 갱신한다.
- `idsByStatus`는 항상 `updatedAt desc -> createdAt desc -> id asc` 정렬 불변식을 유지한다.
- 검색/필터는 query cache가 아니라 selector에서 계산한다.
- 같은 카드 연속 이동은 client-side sequence로 오래된 응답을 무시하고, 최신 요청의 409는 서버 `current.version` 위에 마지막 이동 의도를 한 번 rebase retry한다.
- 409 rebase retry까지 실패하면 서버 최신 상태를 반영하고 충돌을 안내한다.

## 6. 남은 한계와 후속 개선

이 설계는 mutation 이후의 불필요한 전체 재조회와 반복적인 전체 배열 파생 계산을 줄인다. 하지만 최초 `GET /api/tasks`와 최초 normalize 비용은 사라지지 않는다.

또한 컬럼 내부 수동 순서를 영속화하지 않는다. 제품 요구사항으로 수동 순서가 필요하다면 서버 계약에 `position` 또는 `rank` 필드가 추가되어야 한다.

데이터가 500,000개 수준으로 커진다면 추가로 검토할 수 있는 개선은 다음과 같다.

- 서버 pagination 또는 cursor 기반 조회
- status별 API 또는 BFF 계층
- Web Worker 기반 normalize/filter/sort
- selector 기반 external store
- virtualization 강화

다만 현재 과제의 핵심은 주어진 API 제약 안에서 비동기 견고성, rollback, race condition, 5,000개 성능을 안정적으로 완성하는 것이다.
