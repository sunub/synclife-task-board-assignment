# Task Board

This context defines the product language for the task board. It separates task state, board placement, and display order so implementation decisions do not blur product meaning.

## Language

**Task**:
A unit of work shown on the board. A task can move between board columns as its workflow state changes.
_Avoid_: Card when referring to the domain object

**Card**:
The visual representation of a task in the board UI.
_Avoid_: Task when referring only to the rendered UI element

**Board Column**:
A lane on the board that groups tasks by workflow state.
_Avoid_: List, bucket

**Task Status**:
The workflow state that determines which board column a task belongs to.
_Avoid_: Position, order

**Column Display Order**:
The order in which tasks are shown inside a board column. In this project, display order is an automatic viewing policy, not a persisted manual priority.
_Avoid_: Updated date, manual rank

**Manual Column Order**:
A user-defined order of tasks within the same board column. This is a separate product concept from task status and requires a persisted rank or position to be reliable.
_Avoid_: Status change, updated date

**Move Intent**:
The latest user-requested status change for a task while move requests are in flight. Client-side sequence decides which response belongs to the latest intent, and a 409 rebase retry can resend that intent with the server's latest version.
_Avoid_: Server version, response arrival order

**Confirmed Task State**:
The last task state accepted by the server. When every in-flight move for a task fails, the board returns to this state rather than to an intermediate optimistic state.
_Avoid_: Previous UI state, optimistic rollback state

**Rebased Move Retry**:
A retry of the latest move intent after the server rejects it with 409 and returns the current task. The retry keeps the user's target status but uses `current.version` so the final request is based on the server's authoritative version.
_Avoid_: Blind retry, stale rollback

**Offline Read-Only State**:
A temporary board state triggered by network disconnection (e.g., via `navigator.onLine` or API error). In this state, the board is locked to prevent task manipulation, avoiding guaranteed optimistic update rollbacks. This state is guaranteed only within the current browser session; refreshing the page drops the in-memory cache.
_Avoid_: Full offline support, PWA
