# Task Board Virtualization Design Discussion

이 문서는 Task Board의 대량 Card 렌더링 성능을 개선하기 위해 진행한 가상화 설계 토론을 정리한다. 결론만 나열하지 않고, 토론 중 제기된 반박, 동의하지 않은 지점, 합의된 기준, 그리고 각 결정의 장단점을 함께 기록한다.

## 1. 논의의 출발점

현재 API는 `GET /api/tasks`로 전체 Task 목록을 한 번에 반환한다. 이 구조는 프로젝트 범위 안에서 바꿀 수 없으므로, 초기 네트워크 수신 비용과 JSON parse 비용은 프론트엔드만으로 제거할 수 없다.

따라서 이번 성능 개선의 목표는 초기 로딩 시간 단축이 아니다.

목표는 다음과 같이 한정한다.

> 초기 데이터 로드 이후, Board Column 내부 Card 렌더링, 스크롤, 검색 결과 표시, 드래그 조작 중 발생하는 DOM/render 비용을 줄인다.

이 목표 설정은 중요하다. 가상화는 5,000개 Task를 API에서 받는 비용을 줄이지 않는다. 대신 5,000개 Card를 동시에 DOM에 등록하는 비용을 줄인다.

## 2. 가상화 적용 단위

### 2.1 Board 전체 가상화는 제외한다

처음 검토할 수 있는 선택지는 Board 전체를 하나의 virtual list로 보는 방식이다. 하지만 이 방식은 현재 제품 언어와 맞지 않는다.

`Board Column`은 `Task Status`별 독립 영역이다. 각 Column은 자체 count, empty state, drop target, scroll state를 가진다. Board 전체를 하나의 list로 만들면 컬럼별 제품 의미가 흐려지고, 드래그 앤 드롭 처리도 불필요하게 복잡해진다.

### 2.2 Column별 독립 가상화를 선택한다

합의된 방향은 각 Board Column 내부의 Card 목록을 독립적으로 가상화하는 것이다.

결정:

- Board 전체가 아니라 각 Board Column이 독립적인 virtualizer를 가진다.
- 각 virtualizer는 해당 Column의 visible task ids만 대상으로 한다.
- Column count, empty state, drop target은 기존 Column 경계 안에 유지한다.

기대 효과:

- 각 Column의 DOM 노드 수를 독립적으로 제한할 수 있다.
- Column별 scroll position을 별도로 유지할 수 있다.
- 현재 `Task Status` 중심의 보드 모델과 충돌하지 않는다.

## 3. Card 높이: 고정 높이 vs 동적 높이

### 3.1 초기에 제안했던 고정 높이 방향

초기 의견으로는 Card 높이를 고정하는 방향을 제안했다. 고정 높이는 가상화 구현이 단순하고, scroll offset 계산이 안정적이며, 별도 텍스트 높이 계산이나 DOM 측정이 필요 없다.

장점:

- 구현이 단순하다.
- 스크롤 위치 계산이 빠르고 예측 가능하다.
- 브라우저별 텍스트 측정 차이를 고려할 필요가 적다.

하지만 사용자는 이 의견에 동의하지 않았다.

사용자의 반박은 다음과 같다.

> Task 제목이 장문일 수 있는데, Card 높이를 제한하면 사용자는 업무 데이터의 일부만 확인할 수 있다. 이는 UX를 해치며, 성능 문제를 일시적으로 회피하는 것에 가깝다.

이 반박은 타당하다. Task Board에서 Card는 단순 장식 요소가 아니라 업무 내용을 빠르게 파악하기 위한 시각 표현이다. 긴 제목을 줄 수 제한으로 숨기는 것은 성능 최적화가 아니라 정보 접근성의 손실로 이어질 수 있다.

### 3.2 동적 높이 Card를 선택한다

합의된 결정은 Card 높이를 고정하지 않고, 제목 텍스트 길이에 따라 동적으로 계산하는 것이다.

결정:

- Card 제목은 줄 수 제한 없이 전체 노출한다.
- Card 높이 변동 원인은 현재 요구사항에서는 Task 제목 텍스트 길이로 제한한다.
- 이미지, 첨부파일, checklist, markdown block 같은 비텍스트 콘텐츠는 현재 범위 밖으로 둔다.

트레이드오프:

- UX 측면에서는 긴 업무 제목을 온전히 볼 수 있다.
- 구현 측면에서는 고정 높이보다 복잡하다.
- 높이 계산이 부정확하면 scroll jump나 scrollbar 오차가 발생할 수 있다.

## 4. TanStack Virtual과 Pretext를 함께 사용하는 이유

### 4.1 TanStack Virtual의 역할

`@tanstack/react-virtual`은 각 Column의 scroll state, visible range 계산, overscan, 전체 높이 계산, `scrollToIndex` 같은 virtual list 동작을 담당한다.

직접 virtualizer를 구현할 수도 있지만, 동적 높이 목록은 다음 문제가 까다롭다.

- visible range 계산
- overscan 튜닝
- scroll position 유지
- 빠른 스크롤 중 빈 영역 방지
- item 크기 변경 시 total size 갱신

따라서 검증된 virtualizer를 사용하는 편이 직접 구현보다 안전하다.

### 4.2 Pretext의 역할

`@chenglou/pretext`는 Task 제목 텍스트의 높이를 DOM 측정 없이 계산하기 위해 사용한다.

일반적인 동적 높이 virtual list는 item을 렌더한 뒤 `getBoundingClientRect()` 또는 `ResizeObserver`로 실제 DOM 높이를 측정한다. 이 방식은 visible item에 한정되더라도 layout 계산과 보정이 필요하다.

Pretext를 사용하면 제목 텍스트, font, line-height, letter-spacing, white-space, text width를 입력으로 받아 렌더 전에 텍스트 높이를 계산할 수 있다.

이 프로젝트에서 Pretext가 적합한 이유:

- Card 높이 변동 원인을 제목 텍스트로 제한할 수 있다.
- Card 스타일 값은 Task Board 내부에서 고정된다.
- 모든 Card를 DOM에 렌더하지 않고도 높이를 예측할 수 있다.
- 긴 제목을 잘라내지 않고도 가상화의 안정성을 높일 수 있다.

## 5. DOM 측정 fallback에 대한 토론

### 5.1 초기에 제안했던 `measureElement` fallback

초기에는 Pretext를 primary estimator로 사용하되, 렌더된 visible Card에 TanStack Virtual의 `measureElement`를 붙여 실제 DOM 높이와의 차이를 보정하는 방식을 제안했다.

장점:

- CSS 계산식과 실제 DOM 사이의 오차를 보정할 수 있다.
- 브라우저별 subpixel rounding, font loading, word wrapping 차이를 흡수할 수 있다.
- mixed content가 생겼을 때 대응하기 쉽다.

하지만 사용자는 이 의견에 문제를 제기했다.

> `measureElement`를 사용하면 결국 layout 계산이 이루어지므로, Pretext를 사용하는 이점이 흐려지는 것 아닌가?

이 반박은 핵심을 찌른다. Pretext 도입의 주된 목적이 DOM 측정과 reflow 의존을 줄이는 것이라면, 런타임 기본 경로에 `measureElement`를 상시 붙이는 것은 설계 목적을 약화한다.

### 5.2 런타임 기본 경로에서는 DOM 측정을 사용하지 않는다

수정된 결정은 다음과 같다.

결정:

- 런타임 기본 경로에서는 `measureElement` 기반 DOM 측정을 사용하지 않는다.
- Card 높이의 기준은 Pretext 기반 estimator로 둔다.
- DOM 측정은 개발 검증이나, 향후 비텍스트 콘텐츠가 추가될 때의 별도 fallback 후보로만 남긴다.

이 결정을 가능하게 하는 조건:

- Card 높이 변동 원인이 제목 텍스트로 제한되어 있다.
- font, line-height, letter-spacing, white-space, word-break, overflow-wrap은 Task Board 내부에서 동적으로 변하지 않는다.
- padding, border, gap, meta row height도 고정 layout contract로 관리할 수 있다.

트레이드오프:

- Pretext의 장점을 더 온전히 살릴 수 있다.
- CSS와 height estimator의 동기화 책임이 커진다.
- 스타일 변경 시 height calculation test도 함께 갱신해야 한다.

## 6. Card layout 상수

Card 높이에 영향을 주는 값은 런타임에 `getComputedStyle()`로 읽지 않는다.

대신 `cardLayout` 같은 TypeScript 상수를 기준으로 둔다.

예상되는 상수:

```ts
const CARD_TITLE_FONT = '14px Arial'
const CARD_TITLE_LINE_HEIGHT = 20
const CARD_TITLE_LETTER_SPACING = 0
const CARD_VERTICAL_PADDING = 24
const CARD_BORDER_WIDTH = 2
const CARD_META_HEIGHT = 18
const CARD_TITLE_META_GAP = 8
```

이 방식의 장점:

- runtime style read를 피할 수 있다.
- CSS, CSS-in-JS, Tailwind 등 스타일링 방식이 바뀌어도 layout contract는 유지된다.
- Pretext 계산식이 어떤 값에 의존하는지 명확하다.

주의점:

- CSS와 상수가 어긋나면 scroll height 계산이 틀어진다.
- 스타일 변경 시 상수와 테스트를 함께 갱신해야 한다.

## 7. 높이 계산과 캐시 전략

### 7.1 Query cache에는 높이를 넣지 않는다

Card 높이는 서버 상태가 아니라 viewport width와 layout style에서 파생되는 view layout 값이다.

따라서 `TaskBoardModel`이나 TanStack Query cache 안에 Card height를 넣지 않는다. Query cache는 Task 데이터와 board read model을 위한 곳이고, 현재 Column width나 font 조건에 따른 pixel height는 별도 layout utility 책임으로 둔다.

### 7.2 전용 layout cache를 사용한다

Pretext 계산 결과는 모듈 레벨 Map 또는 전용 layout utility cache에 저장한다.

캐시 키는 높이에 영향을 주는 입력으로 구성한다.

예:

```ts
`${task.id}:${task.title}:${font}:${letterSpacing}:${textWidth}`
```

`title`을 포함하는 이유는 현재 높이 변동 원인이 제목 텍스트이기 때문이다. Column width나 font 조건이 바뀌면 cache key가 달라져 새 높이를 계산한다.

### 7.3 Lazy estimator를 사용한다

모든 Task의 높이를 초기 렌더 전에 eager하게 계산하지 않는다. 대신 TanStack Virtual의 `estimateSize(index)`에서 필요한 index의 높이를 요청할 때 계산한다.

결정:

- `estimateSize`는 평균값이 아니라 Pretext 기반의 Card 높이를 반환한다.
- 계산은 lazy하게 수행한다.
- 동일 입력의 계산 결과는 cache에서 재사용한다.

이유:

- 평균값 추정은 scroll jump와 scrollbar 오차를 키울 수 있다.
- 전체 5,000개 높이를 한 번에 계산하면 초기 데이터 로드 직후 CPU 비용이 커진다.
- Lazy calculation은 정확도와 초기 비용 사이의 균형을 잡는다.

## 8. Column width와 scroll position

### 8.1 실제 Column width를 기준으로 계산한다

Pretext가 사용할 text width는 CSS 상수가 아니라 실제 Column/Card 너비에서 파생한다.

결정:

- 각 Board Column은 자신의 container width를 `ResizeObserver`로 관찰한다.
- Card padding, border를 제외한 title text width를 계산한다.
- Pretext는 이 text width를 기준으로 제목 높이를 산출한다.

`ResizeObserver`는 모든 Card를 측정하기 위해 쓰는 것이 아니다. Column container 하나의 너비 변화를 관찰하기 위한 것이므로 비용이 작고 목적이 명확하다.

### 8.2 검색어 변경 시 top으로 reset한다

검색어 변경은 visible task ids 자체를 바꾸는 동작이다. 이전 scroll offset은 새 검색 결과 목록에서 의미가 약하다.

결정:

- 검색이 적용되면 필터링된 visible task ids만 가상화한다.
- Column count도 현재 visible task ids 개수를 나타낸다.
- 검색어가 변경되면 각 Column virtualizer는 top으로 reset한다.

### 8.3 Column width 변경 시 scroll position을 유지한다

Column width 변경은 목록 내용 변경이 아니라 같은 목록의 레이아웃 변경이다.

결정:

- Column width가 바뀌어도 visible task ids는 유지한다.
- Card height는 새 text width 기준으로 재계산한다.
- 기존 scroll position은 가능한 유지한다.
- 극단적인 width 변경으로 offset이 유효 범위를 벗어나면 virtualizer 또는 브라우저의 clamp 동작을 따른다.

## 9. Overscan

동적 높이 Card에서는 fixed-height list보다 overscan을 약간 넉넉히 두는 편이 안전하다.

결정:

- 각 Board Column virtualizer의 초기 overscan은 8로 둔다.
- 빠른 스크롤 중 빈 영역이 보이면 늘린다.
- 렌더 비용이 과하면 줄인다.
- overscan은 제품 의미가 아니라 성능 튜닝 값으로 취급한다.

## 10. Drag and drop 의미

### 10.1 현업 기준의 구분

현업에서는 가상화된 Kanban에서 Column 간 이동과 Column 내부 수동 순서 변경을 같은 문제로 보지 않는다.

상태 변경 중심 보드는 Card를 다른 Column에 드롭하면 `Task Status`를 바꾸는 의미를 가진다. Column 내부 순서는 `updatedAt`, `priority`, `dueDate`, `createdAt` 같은 자동 정렬 정책으로 결정된다.

반면 수동 우선순위 보드는 "이 Task를 이 Task 위에 놓는다"가 제품 의미를 가진다. 이 경우 서버 모델에 `rank`, `position`, `sortKey` 같은 필드가 있어야 하며, 충돌 정책도 필요하다.

현재 API에는 Column 내부 수동 순서를 영속할 필드가 없다.

### 10.2 현재 범위에서는 status 변경만 제공한다

결정:

- Drag and drop의 영속 의미는 `Task Status` 변경으로 제한한다.
- Card를 Board Column에 드롭하면 해당 Column의 status로 변경한다.
- 특정 Card 사이에 드롭하는 manual ordering은 제공하지 않는다.
- Column 내부 표시 순서는 기존 자동 정렬 정책을 따른다.

이유:

- 현재 API가 manual order를 저장할 수 없다.
- 가상화된 목록에서는 화면 밖 Card가 DOM에 없으므로 index 기반 drop 의미가 더 불안정하다.
- 저장할 수 없는 순서를 프론트엔드가 있는 것처럼 보여주면 새로고침, 검색 해제, 충돌 복구 후 설명하기 어려운 UX가 된다.

## 11. 최종 결정 요약

- 초기 API 로딩 시간 단축은 이번 가상화 목표가 아니다.
- 목표는 데이터 로드 이후 DOM/render/scroll 비용 절감이다.
- Board 전체가 아니라 각 Board Column 내부 Card 목록을 독립적으로 가상화한다.
- Card 높이는 고정하지 않고, Task 제목 전체를 표시한다.
- 현재 높이 변동 원인은 제목 텍스트 길이로 제한한다.
- `@tanstack/react-virtual`은 virtual list 동작을 담당한다.
- `@chenglou/pretext`는 제목 텍스트 높이를 DOM 측정 없이 계산한다.
- 런타임 기본 경로에서는 `measureElement` fallback을 사용하지 않는다.
- Card height 계산은 layout 상수와 실제 Column text width를 입력으로 한다.
- 높이 계산 결과는 query cache가 아니라 layout utility cache에 둔다.
- `estimateSize`는 Pretext 기반 높이를 lazy하게 계산해 반환한다.
- 검색어 변경 시 Column scroll position은 top으로 reset한다.
- Column width 변경 시 scroll position은 가능한 유지한다.
- 초기 overscan은 8로 둔다.
- Drag and drop의 의미는 Task Status 변경으로 제한한다.
