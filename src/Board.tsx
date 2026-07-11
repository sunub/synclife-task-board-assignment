import { useMemo, useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { Status, Task } from "./types/task";
import {
  getConflictCurrentTaskFromPayload,
  type MoveTaskContext,
  type MoveTaskVariables,
  type TaskColumn,
} from "./types/task";
import { ApiError, updateTask } from "./api/client";
import { defaultTaskQueryOptions } from "./api/query";
import { Column } from "./components/Column";
import {
  applyServerTask,
  moveTaskOptimistically,
  selectVisibleTaskIdsByStatus,
  type TaskBoardModel,
  type TaskSortKey,
  type TaskSortOptions,
} from "./lib/tasks";
import { toast, Toaster } from "sonner";
import { EdittingProvider } from "./provider/EdittingProvider";

const COLUMNS: TaskColumn[] = [
  { status: "todo", title: "To Do" },
  { status: "in-progress", title: "In Progress" },
  { status: "done", title: "Done" },
];

const SORT_OPTIONS: Record<TaskSortKey, TaskSortOptions> = {
  title: { sortBy: "title", direction: "asc" },
  priority: { sortBy: "priority", direction: "desc" },
  createdAt: { sortBy: "createdAt", direction: "asc" },
  updatedAt: { sortBy: "updatedAt", direction: "desc" },
};

function getConflictCurrentTask(error: unknown): Task | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }

  return getConflictCurrentTaskFromPayload(error.payload);
}

export default function Board() {
  const queryClient = useQueryClient();
  const { data: boardModel } = useSuspenseQuery(defaultTaskQueryOptions);
  const latestMoveSequenceByTaskId = useRef(new Map<string, number>());
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<TaskSortKey>("updatedAt");
  const [scrollToTopVersion, setScrollToTopVersion] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scrollTargetByStatus, setScrollTargetByStatus] = useState<
    Partial<Record<Status, string>>
  >({});
  const sortOptions = SORT_OPTIONS[sortBy];
  const moveTaskMutation = useMutation<
    Task,
    unknown,
    MoveTaskVariables,
    MoveTaskContext
  >({
    mutationFn: ({ id, status, version }) =>
      updateTask(id, { status, version }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({
        queryKey: defaultTaskQueryOptions.queryKey,
      });

      const currentModel =
        queryClient.getQueryData<TaskBoardModel>(
          defaultTaskQueryOptions.queryKey,
        ) ?? boardModel;
      const previousTask = currentModel.byId[id];
      const sequence = (latestMoveSequenceByTaskId.current.get(id) ?? 0) + 1;
      latestMoveSequenceByTaskId.current.set(id, sequence);
      const updatedAt = new Date().toISOString();

      queryClient.setQueryData<TaskBoardModel>(
        defaultTaskQueryOptions.queryKey,
        (old) =>
          old
            ? moveTaskOptimistically(old, id, status, updatedAt, sortOptions)
            : old,
      );

      return {
        taskId: id,
        sequence,
        previousTask,
      };
    },
    onSuccess: (updatedTask, _variables, context) => {
      if (
        latestMoveSequenceByTaskId.current.get(context.taskId) !==
        context.sequence
      ) {
        return;
      }

      queryClient.setQueryData<TaskBoardModel>(
        defaultTaskQueryOptions.queryKey,
        (old) => (old ? applyServerTask(old, updatedTask, sortOptions) : old),
      );
      setScrollTargetByStatus((previous) => ({
        ...previous,
        [updatedTask.status]: updatedTask.id,
      }));
    },
    onError: (error, _variables, context) => {
      if (!context) {
        return;
      }
      if (
        latestMoveSequenceByTaskId.current.get(context.taskId) !==
        context.sequence
      ) {
        return;
      }

      const currentTask = getConflictCurrentTask(error);

      if (currentTask) {
        queryClient.setQueryData<TaskBoardModel>(
          defaultTaskQueryOptions.queryKey,
          (old) => (old ? applyServerTask(old, currentTask, sortOptions) : old),
        );
        const message = "다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다.";
        setStatusMessage(message);
        toast.error(message);
        return;
      }

      queryClient.setQueryData<TaskBoardModel>(
        defaultTaskQueryOptions.queryKey,
        (old) =>
          old ? applyServerTask(old, context.previousTask, sortOptions) : old,
      );
      const message = "이동에 실패해 이전 상태로 되돌렸습니다.";
      setStatusMessage(message);
      toast.info(message);
    },
  });

  const moveTask = (id: string, status: Status) => {
    const currentModel =
      queryClient.getQueryData<TaskBoardModel>(
        defaultTaskQueryOptions.queryKey,
      ) ?? boardModel;
    const task = currentModel.byId[id];

    if (!task || task.status === status) {
      return;
    }

    moveTaskMutation.mutate({ id, status, version: task.version });
  };

  const changeSortBy = (nextSortBy: TaskSortKey) => {
    if (sortBy === nextSortBy) {
      return;
    }

    setSortBy(nextSortBy);
    setScrollToTopVersion((currentVersion) => currentVersion + 1);
  };

  const changeSearchText = (nextSearchText: string) => {
    if (searchText === nextSearchText) {
      return;
    }

    setSearchText(nextSearchText);
    setScrollToTopVersion((currentVersion) => currentVersion + 1);
  };

  const totalTaskCount =
    boardModel.idsByStatus.todo.length +
    boardModel.idsByStatus["in-progress"].length +
    boardModel.idsByStatus.done.length;

  const visibleTaskIdsByStatus = useMemo(
    () => selectVisibleTaskIdsByStatus(boardModel, { searchText, sortOptions }),
    [boardModel, searchText, sortOptions],
  );

  if (totalTaskCount === 0) {
    return <p className="hint">표시할 작업이 없습니다.</p>;
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      {statusMessage ? (
        <p className="sr-only" role="status">
          {statusMessage}
        </p>
      ) : null}
      <div className="board-toolbar">
        <input
          aria-label="작업 검색"
          type="search"
          value={searchText}
          onChange={(event) => changeSearchText(event.target.value)}
        />
        <select
          aria-label="정렬 기준"
          value={sortBy}
          onChange={(event) => changeSortBy(event.target.value as TaskSortKey)}
        >
          <option value="title">제목 순</option>
          <option value="priority">우선순위</option>
          <option value="createdAt">생성 날짜</option>
          <option value="updatedAt">업데이트 날짜</option>
        </select>
      </div>
      <div className="board">
        <EdittingProvider>
          {COLUMNS.map((col) => (
            <Column
              key={col.status}
              title={col.title}
              status={col.status}
              taskIds={visibleTaskIdsByStatus[col.status]}
              taskById={boardModel.byId}
              onMove={moveTask}
              scrollToTaskId={scrollTargetByStatus[col.status]}
              scrollToTopVersion={scrollToTopVersion}
            />
          ))}
        </EdittingProvider>
      </div>
    </>
  );
}
