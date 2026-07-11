import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { Column } from "./Column";
import type { Status, Task, TaskBoardModel, TaskColumn } from "../types/task";

const COLUMNS: TaskColumn[] = [
  { status: "todo", title: "To Do" },
  { status: "in-progress", title: "In Progress" },
  { status: "done", title: "Done" },
];

type TaskBoardColumnsProps = {
  boardModel: TaskBoardModel;
  visibleTaskIdsByStatus: Record<Status, string[]>;
  onMove: (id: string, status: Status) => void;
  onEditTask: (task: Task) => void;
  dragDisabled: boolean;
  scrollTargetByStatus: Partial<Record<Status, string>>;
  scrollToTopVersion: number;
};

export function TaskBoardColumns({
  boardModel,
  visibleTaskIdsByStatus,
  onMove,
  onEditTask,
  dragDisabled,
  scrollTargetByStatus,
  scrollToTopVersion,
}: TaskBoardColumnsProps) {
  const moveTaskFromDragEnd = (event: DragEndEvent) => {
    if (dragDisabled || event.canceled) {
      return;
    }

    const taskId = event.operation.source?.id;
    const targetStatus = COLUMNS.find(
      ({ status }) => status === event.operation.target?.id,
    )?.status;

    if (!taskId || !targetStatus) {
      return;
    }

    onMove(String(taskId), targetStatus);
  };

  return (
    <DragDropProvider onDragEnd={moveTaskFromDragEnd}>
      <div className="board">
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            title={col.title}
            status={col.status}
            taskIds={visibleTaskIdsByStatus[col.status]}
            taskById={boardModel.byId}
            onEditTask={onEditTask}
            dragDisabled={dragDisabled}
            scrollToTaskId={scrollTargetByStatus[col.status]}
            scrollToTopVersion={scrollToTopVersion}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
