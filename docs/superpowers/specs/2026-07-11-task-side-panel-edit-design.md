# Task CRUD Side Panel 및 Optimistic UI 설계

## 요약

Task 수정은 단일 side panel form으로 처리한다. Card는 보드 위에서 task를 보여주는 read-only UI representation으로 남기고, 책임은 task 요약 표시, drag 이동, 명시적인 수정 버튼 제공으로 제한한다.

이 설계는 inline double-click 편집, 상세 보기 후 편집 전환, 성공 경로의 full-list query invalidation을 제외한다. 대신 README의 Priority 1 요구사항에 맞춰 이동, 수정, 삭제, 생성 모두 **UI를 먼저 반영한 뒤 서버에 요청하는 낙관적 업데이트**를 사용한다.

`CONTEXT.md`의 용어를 따른다.

- **Task**: 보드에서 관리하는 domain object
- **Card**: task를 보드에 보여주는 visual representation
- **Task Status**: task가 속한 Board Column을 결정하는 workflow state
- **Column Display Order**: persisted manual order가 아니라 자동 표시 정책

## 목표

- 보드에서 task를 생성, 수정, 삭제할 수 있게 한다.
- 한 번에 하나의 task edit session만 활성화한다.
- Card를 안정적인 read-only virtualized item으로 유지한다.
- 이동, 수정, 삭제, 생성을 각각 낙관적으로 UI에 먼저 반영한다.
- 실패 시 이전 `TaskBoardModel` 상태로 정확히 rollback하고 사용자에게 알린다.
- 서버가 반환한 task를 사용해 normalized query cache를 직접 갱신한다.
- 단일 task 변경 후 전체 task 목록을 다시 fetch하지 않는다.
- Drag 이동과 form 기반 CRUD mutation의 책임을 분리한다.

## 비목표

- Card 내부 inline editing은 제공하지 않는다.
- Double-click edit mode는 제공하지 않는다.
- Card 전체에 `Enter` keyboard shortcut을 붙여 editor를 열지 않는다.
- Edit form 전에 task 상세 read-only view를 만들지 않는다.
- 첫 구현에서는 dirty-change confirmation을 만들지 않는다.
- 성공 경로에서 `invalidateQueries`를 사용하지 않는다.
- Manual Column Order를 구현하지 않는다.
- 새 dependency를 추가하지 않는다.

## UX 결정

### Card는 Read-Only로 유지한다

`Card.tsx`는 task title과 metadata를 read-only content로 렌더링한다. Card는 draft state를 소유하지 않고, editable title input도 렌더링하지 않는다.

이 결정은 다음 충돌을 피하기 위한 것이다.

- Card drag
- Form focus
- Double-click behavior
- Virtual row height calculation
- Optimistic move state
- Edit draft state

### 명시적인 수정 버튼을 둔다

각 Card에는 task 수정 form을 여는 명확한 수정 버튼을 제공한다.

마우스 UX와 keyboard 접근성은 다음 정책을 따른다.

- 수정 버튼은 항상 DOM에 존재하는 실제 `button`이어야 한다.
- 버튼은 `Tab`으로 접근 가능해야 한다.
- `Enter` 또는 `Space`는 native button behavior로 side panel을 연다.
- Card hover 시 버튼을 시각적으로 더 명확히 보여준다.
- Card focus-within 상태에서도 버튼을 시각적으로 보여준다.
- Hover 상태일 때만 버튼을 mount/unmount하지 않는다.
- Hover에 의존해서 keyboard 접근 가능 여부가 달라지면 안 된다.

즉, edit affordance는 마우스 사용자에게 hover/focus 시 분명하게 드러나야 하지만, 접근성은 hover 상태에 의존하지 않아야 한다.

Card 자체에는 panel을 여는 custom `onKeyDown` handler를 붙이지 않는다. 실제 `button`을 사용하는 편이 action target을 더 명확하게 만들고, Card 전체가 거대한 button처럼 동작하는 문제를 피할 수 있다.

### Side Panel은 곧바로 Edit Form으로 열린다

현재 요구사항은 task 상세 열람이 아니라 수정이다. 따라서 side panel을 열면 상세 view가 아니라 form을 바로 보여준다.

Panel에는 다음 요소를 둔다.

- Title textarea
- Priority control
- Status control
- Save button
- Delete button
- Cancel button
- Close button
- Save/delete 실패를 표시하는 inline error area

### 명시적 저장 모델을 사용한다

Form draft는 `Save`를 눌렀을 때만 mutation으로 제출한다.

다음 동작은 draft를 버리고 panel을 닫는다.

- `Cancel`
- Close button
- Outside click
- `Escape`

이 모델은 form의 mental model을 단순하게 만든다. Draft 변경은 `Save` 전까지 local 상태일 뿐이고, `Save`를 누르는 순간 낙관적 업데이트가 시작된다.

Dirty confirmation은 첫 구현 범위에서 제외한다. 향후 긴 description 편집이 추가되거나 실제 사용자 피드백에서 실수로 입력을 잃는 문제가 드러나면 추가한다.

### 삭제는 확인 후 수행한다

Task 삭제는 되돌릴 수 있는 서버 mutation이지만, 사용자 입장에서는 파괴적인 action이다. 따라서 삭제 버튼을 누르면 확인 dialog를 먼저 보여준다.

정책:

- 사용자가 삭제를 확인해야 delete mutation을 시작한다.
- 확인 후에는 Card를 즉시 보드에서 제거한다.
- 서버 실패 시 삭제 전 task를 cache에 복원하고 사용자에게 실패를 알린다.
- 성공 시 별도 full-list refetch는 하지 않는다.

### 생성은 별도 진입점에서 수행한다

Task 생성은 Board 또는 Column 단위의 명시적인 create button에서 시작한다. 생성 form은 side panel을 재사용할 수 있지만, edit session과 mode를 구분한다.

권장 UX:

- Board 상단 또는 Column header에 create button을 둔다.
- Column에서 생성하면 해당 column의 `status`를 초기값으로 사용한다.
- Title과 priority는 필수로 입력받는다.
- Description은 API가 허용하므로 선택값으로 둘 수 있다.
- `Save`를 누르면 임시 task를 즉시 cache에 추가한다.
- 서버 성공 시 임시 task를 서버 task로 교체한다.
- 서버 실패 시 임시 task를 제거하고 사용자에게 실패를 알린다.

### 편집 중 Drag

Edit 또는 create panel이 열려 있는 동안에는 최소한 편집 중인 task의 drag를 비활성화한다. 구현을 단순하게 유지하려면 panel이 열려 있는 동안 모든 card drag를 비활성화해도 된다.

이것은 UX 결정이면서 데이터 정합성 결정이기도 하다. 사용자가 stale form을 수정하는 동시에 같은 task를 drag mutation으로 이동시키는 상황을 방지한다.

## 상태 모델

Provider가 단일 form session을 소유한다.

```ts
type TaskFormState =
  | { mode: "idle" }
  | {
      mode: "editing";
      taskId: string;
      draft: TaskFormDraft;
      errorMessage?: string;
    }
  | {
      mode: "creating";
      draft: TaskFormDraft;
      errorMessage?: string;
    };

type TaskFormDraft = {
  title: string;
  priority: Priority;
  status: Status;
  description?: string;
};
```

Draft에는 사용자가 수정할 수 있는 값만 포함한다. `version`은 draft에 저장하지 않는다.

Edit save의 `version`은 save 시점에 최신 `TaskBoardModel` cache에서 읽는다. 이렇게 해야 panel을 열 때 캡처한 오래된 version으로 저장하는 문제를 피할 수 있다.

권장 provider action은 다음과 같다.

```ts
openEditor(task: Task): void
openCreator(initialStatus?: Status): void
updateDraft(patch: Partial<TaskFormDraft>): void
setFormError(message: string): void
clearFormError(): void
cancelForm(): void
```

현재 `Editting` naming은 오타다. 이 기능이 provider API를 수정한다면, 오타가 더 퍼지기 전에 `Editing` 또는 `TaskForm`으로 rename하는 편이 좋다.

## TaskBoardModel Helper

이 설계는 mutation별로 다른 낙관적 업데이트를 수행하되, normalized cache 조작은 순수 helper로 분리한다.

권장 helper:

```ts
applyTaskPatchOptimistically(
  model: TaskBoardModel,
  taskId: string,
  patch: Partial<Pick<Task, "title" | "priority" | "status" | "description">>,
  updatedAt: string,
): TaskBoardModel

addTaskOptimistically(model: TaskBoardModel, task: Task): TaskBoardModel

removeTaskOptimistically(model: TaskBoardModel, taskId: string): TaskBoardModel

replaceTask(model: TaskBoardModel, previousTaskId: string, nextTask: Task): TaskBoardModel
```

`applyServerTask`는 서버가 반환한 authoritative task를 cache에 반영하는 공통 성공/충돌 helper로 유지한다.

Helper는 `idsByStatus`의 자동 정렬 불변식을 유지해야 한다.

```ts
// idsByStatus[status] is sorted by:
// updatedAt desc, createdAt desc, id asc
```

Manual Column Order는 현재 API에 persisted rank가 없으므로 구현하지 않는다.

## 데이터 흐름

### Edit Panel 열기

1. 사용자가 Card의 수정 버튼을 활성화한다.
2. Provider는 선택한 task id와 task 값에서 복사한 초기 draft를 사용해 `editing` mode로 진입한다.
3. `TaskEditPanel`은 provider state를 읽어 form을 렌더링한다.

### Create Panel 열기

1. 사용자가 create button을 활성화한다.
2. Provider는 `creating` mode로 진입한다.
3. Initial status는 create button이 위치한 Board Column을 우선 사용하고, 전역 create라면 기본값은 `todo`로 둔다.
4. `TaskEditPanel` 또는 `TaskFormPanel`은 create draft를 렌더링한다.

### 취소 또는 닫기

1. 사용자가 `Cancel`, close button, panel 바깥 영역을 클릭하거나 `Escape`를 누른다.
2. Provider는 `idle`로 돌아간다.
3. 아직 mutation이 시작되지 않았다면 API request는 전송하지 않는다.
4. Board cache는 변경하지 않는다.

### 수정 저장

1. 사용자가 editing mode에서 `Save`를 클릭한다.
2. Save 시점에 `taskId`로 `TaskBoardModel` cache에서 최신 task를 읽는다.
3. Task가 없으면 panel을 열어둔 채 error를 표시한다.
4. 이전 task를 rollback context로 저장한다.
5. `applyTaskPatchOptimistically`로 draft를 즉시 cache에 반영한다.
6. `updateTask(taskId, { title, priority, status, description, version })`을 호출한다.
7. 성공하면 `applyServerTask(old, updatedTask)`로 optimistic task를 서버 task로 확정한다.
8. 실패하면 이전 task를 `applyServerTask`로 복원하고 사용자에게 실패를 알린다.
9. 409 conflict이면 서버 current를 cache에 반영하고 draft는 보존한 채 conflict error를 표시한다.

성공 handler는 다음 형태를 사용한다.

```ts
queryClient.setQueryData<TaskBoardModel>(
  defaultTaskQueryOptions.queryKey,
  (old) => (old ? applyServerTask(old, updatedTask) : old),
);
```

성공 경로에서는 `invalidateQueries`를 호출하지 않는다. 서버는 이미 authoritative updated task를 반환하고, normalized board model은 전체 task를 다시 fetch하지 않고도 단일 task를 갱신할 수 있다.

### 삭제

1. 사용자가 delete button을 클릭한다.
2. 확인 dialog에서 삭제를 확정한다.
3. 삭제 전 task를 rollback context로 저장한다.
4. `removeTaskOptimistically`로 task를 즉시 cache에서 제거한다.
5. `deleteTask(taskId)`를 호출한다.
6. 성공하면 cache를 추가로 refetch하지 않는다.
7. 실패하면 rollback context의 task를 `applyServerTask` 또는 `addTaskOptimistically`로 복원하고 사용자에게 실패를 알린다.

삭제 성공 응답은 task를 반환하지 않으므로, 성공 시에는 optimistic removal을 그대로 확정한다.

### 생성

1. 사용자가 creating mode에서 `Save`를 클릭한다.
2. Client temporary id를 가진 optimistic task를 만든다.
3. `addTaskOptimistically`로 즉시 cache에 추가한다.
4. `createTask({ title, priority, status, description })`를 호출한다.
5. 성공하면 `replaceTask(model, temporaryId, serverTask)`로 임시 task를 서버 task로 교체한다.
6. 실패하면 `removeTaskOptimistically(model, temporaryId)`로 임시 task를 제거하고 사용자에게 실패를 알린다.

Temporary task는 UI에서 pending 상태를 표시할 수 있다. 단, pending flag는 서버 `Task` 타입에 저장하지 않고 UI-only metadata 또는 별도 mutation state로 관리한다.

## Mutation 정책

### Move, Edit, Delete, Create Mutation은 분리한다

각 mutation은 모두 optimistic UI를 사용하지만 rollback context와 성공 처리 방식이 다르다.

- Move: status 변경, client sequence, stale response suppression, previous task rollback
- Edit: title/priority/status/description patch, previous task rollback, conflict 시 draft 보존
- Delete: previous task rollback, 성공 응답 task 없음
- Create: temporary task 추가, 성공 시 temporary id를 server id로 교체

따라서 네 흐름을 하나의 generic mutation abstraction으로 성급하게 합치지 않는다. `TaskBoardModel` helper, conflict payload parsing, notification helper 같은 작은 단위만 공유한다.

### 모든 쓰기 작업은 Optimistic UI를 사용한다

README의 Priority 1 요구사항에 따라 이동, 수정, 삭제, 생성은 모두 UI를 먼저 반영한 뒤 서버에 요청한다.

스피너를 띄우고 서버 성공 후에만 UI를 반영하는 방식은 요구사항을 만족하지 않는다.

다만 mutation별로 optimistic UI의 범위는 다르게 둔다.

- Move: Card가 즉시 target status column으로 이동한다.
- Edit: Card title, priority, status, description 변경이 즉시 cache에 반영된다.
- Delete: Card가 즉시 보드에서 사라진다.
- Create: 임시 Card가 즉시 보드에 나타난다.

### Conflict 처리

409 conflict response가 발생하면 다음 정책을 따른다.

1. `ApiError.payload.current`에 유효한 task가 있으면 `applyServerTask`로 cache에 반영한다.
2. Panel은 열린 상태로 유지한다.
3. 사용자의 draft는 보존한다.
4. Conflict error message를 표시한다.

첫 구현에서는 사용자의 draft를 새 server version 기준으로 자동 재시도하지 않는다. 필요하면 이후 별도 정책으로 추가한다.

## Virtualization 영향

Side panel editing은 form height를 virtualized card row 밖에 둔다.

따라서 `Column.tsx`는 계속 read-only task title을 기준으로 Pretext 기반 card height를 계산하면 된다. Virtualizer는 Card 내부에서 커지는 textarea를 고려할 필요가 없다.

Optimistic edit save가 title을 즉시 cache에 반영하면, 해당 Card의 read-only title이 즉시 바뀐다. 이때 Card height estimation도 optimistic title 기준으로 다시 계산되어야 한다.

현재 `estimateCardHeight`에서 고정 width `300`을 사용하는 문제는 별도의 virtualization 개선 과제로 남긴다. 이번 설계는 저장 전 Card 내부에 textarea를 만들지 않으므로 form 높이가 virtual row height를 깨뜨리는 문제는 만들지 않는다.

## 테스트 기준

- Card는 title과 metadata를 read-only content로 렌더링한다.
- Card는 접근 가능한 수정 버튼을 제공한다.
- 수정 버튼은 hover/focus 시 시각적으로 드러나고, `Tab`으로 접근 가능하다.
- 수정 버튼을 활성화하면 side panel form이 열린다.
- Form은 선택한 task 값으로 초기화된다.
- Title, priority, status, description 수정은 save 전에는 provider draft만 변경한다.
- `Cancel`, close button, outside click, `Escape`는 mutation 없이 panel을 닫는다.
- Edit `Save`는 최신 cached task version으로 PATCH를 보낸다.
- Edit save 시작 시 draft가 cache에 낙관적으로 반영된다.
- Edit save 성공 시 반환된 task를 `applyServerTask`로 반영하고 panel을 닫는다.
- Edit save 실패 시 이전 task로 rollback하고 사용자에게 실패를 알린다.
- Status edit 성공 시 Card는 반환된 task의 status column에 남는다.
- 409 conflict는 `payload.current`를 cache에 반영하지만 draft는 보존하고 error를 표시한다.
- Delete는 확인 dialog 이후 Card를 즉시 제거한다.
- Delete 실패 시 삭제 전 task를 복원한다.
- Create save 시작 시 임시 Card를 즉시 추가한다.
- Create 성공 시 임시 Card를 서버 task로 교체한다.
- Create 실패 시 임시 Card를 제거한다.
- Edit/create panel이 열려 있는 동안에는 최소한 편집 중인 task의 drag가 비활성화된다.
- 모든 write success path에서 `invalidateQueries`를 호출하지 않는다.

## 구현 참고 사항

- 기존 `ComboBox.tsx`를 완성도 있는 accessible combobox로 개선하지 않는 한, priority와 status에는 native `select`를 우선 사용한다.
- Side panel outside click handler를 추가한다면, panel 내부 클릭이 close behavior로 bubble되지 않도록 처리한다.
- Provider를 `Editting`에서 `Editing` 또는 `TaskForm`으로 rename한다면, import 갱신을 하나의 집중된 변경으로 처리한다.
- Edit, move, delete, create test는 분리해서 작성한다. 그래야 mutation policy 차이를 이해하기 쉽다.
- Optimistic helper는 순수 함수로 작성하고 rollback test를 우선 둔다.
