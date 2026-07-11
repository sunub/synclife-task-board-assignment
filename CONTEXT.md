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
