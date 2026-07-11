import { useMemo, useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type {
  Status,
  Task,
  TaskBoardModel,
  TaskEditablePatch,
  TaskSortKey,
  TaskSortOptions,
} from "./types/task";
import {
  getConflictCurrentTaskFromPayload,
  type MoveTaskContext,
  type MoveTaskVariables,
  type TaskColumn,
} from "./types/task";
import { ApiError, createTask, deleteTask, updateTask } from "./api/client";
import { defaultTaskQueryOptions } from "./api/query";
import { Column } from "./components/Column";
import {
  addTaskOptimistically,
  applyTaskPatchOptimistically,
  applyServerTask,
  moveTaskOptimistically,
  removeTaskOptimistically,
  replaceTask,
  selectVisibleTaskIdsByStatus,
} from "./lib/tasks";
import { toast, Toaster } from "sonner";
import type { Priority } from "./types/task";
import { TaskFormPanel } from "./components/TaskFormPanel";
import { TaskBoardHeader } from "./components/TaskBoardHeader/TaskBoardHeader";

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

type TaskFormDraft = {
  title: string;
  description: string;
  priority: Priority;
  status: Status;
};

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

const EMPTY_CREATE_DRAFT: TaskFormDraft = {
  title: "",
  description: "",
  priority: "medium",
  status: "todo",
};

function createDraftFromTask(task: Task): TaskFormDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    status: task.status,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청에 실패했습니다.";
}

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
  const [formState, setFormState] = useState<TaskFormState>({ mode: "idle" });
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
        const message =
          "다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다.";
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

  const getCurrentBoardModel = (): TaskBoardModel =>
    queryClient.getQueryData<TaskBoardModel>(
      defaultTaskQueryOptions.queryKey,
    ) ?? boardModel;

  const openEditor = (task: Task) => {
    setFormState({
      mode: "editing",
      taskId: task.id,
      draft: createDraftFromTask(task),
    });
  };

  const openCreator = (initialStatus: Status = "todo") => {
    setFormState({
      mode: "creating",
      draft: {
        ...EMPTY_CREATE_DRAFT,
        status: initialStatus,
      },
    });
  };

  const updateDraft = (patch: Partial<TaskFormDraft>) => {
    setFormState((current) => {
      if (current.mode === "idle") return current;

      return {
        ...current,
        draft: {
          ...current.draft,
          ...patch,
        },
        errorMessage: undefined,
      };
    });
  };

  const setFormError = (message: string) => {
    setFormState((current) =>
      current.mode === "idle"
        ? current
        : {
          ...current,
          errorMessage: message,
        },
    );
  };

  const closeForm = () => {
    setFormState({ mode: "idle" });
  };

  const saveForm = async (): Promise<void> => {
    if (formState.mode === "idle") {
      return;
    }

    const trimmedTitle = formState.draft.title.trim();

    if (!trimmedTitle) {
      setFormError("제목을 입력해 주세요.");
      return;
    }

    const patch: TaskEditablePatch = {
      title: trimmedTitle,
      description: formState.draft.description.trim() || undefined,
      priority: formState.draft.priority,
      status: formState.draft.status,
    };

    await queryClient.cancelQueries({
      queryKey: defaultTaskQueryOptions.queryKey,
    });

    if (formState.mode === "editing") {
      const currentModel = getCurrentBoardModel();
      const previousTask = currentModel.byId[formState.taskId];

      if (!previousTask) {
        setFormError("수정할 작업을 찾을 수 없습니다.");
        return;
      }

      const optimisticUpdatedAt = new Date().toISOString();

      queryClient.setQueryData<TaskBoardModel>(
        defaultTaskQueryOptions.queryKey,
        (old) =>
          old
            ? applyTaskPatchOptimistically(
              old,
              formState.taskId,
              patch,
              optimisticUpdatedAt,
              sortOptions,
            )
            : old,
      );

      try {
        const updatedTask = await updateTask(formState.taskId, {
          ...patch,
          version: previousTask.version,
        });

        queryClient.setQueryData<TaskBoardModel>(
          defaultTaskQueryOptions.queryKey,
          (old) => (old ? applyServerTask(old, updatedTask, sortOptions) : old),
        );
        closeForm();
      } catch (error) {
        const currentTask = getConflictCurrentTask(error);

        if (currentTask) {
          queryClient.setQueryData<TaskBoardModel>(
            defaultTaskQueryOptions.queryKey,
            (old) =>
              old ? applyServerTask(old, currentTask, sortOptions) : old,
          );
          const message =
            "다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다.";
          setFormError(message);
          toast.error(message);
          return;
        }

        queryClient.setQueryData<TaskBoardModel>(
          defaultTaskQueryOptions.queryKey,
          (old) =>
            old ? applyServerTask(old, previousTask, sortOptions) : old,
        );
        const message = "수정에 실패해 이전 상태로 되돌렸습니다.";
        setFormError(`${message} ${getErrorMessage(error)}`);
        toast.error(message);
      }

      return;
    }

    const now = new Date().toISOString();
    const temporaryTask: Task = {
      id: `temporary-${crypto.randomUUID()}`,
      title: patch.title ?? trimmedTitle,
      description: patch.description,
      status: patch.status ?? "todo",
      priority: patch.priority ?? "medium",
      tags: [],
      assignee: undefined,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };

    queryClient.setQueryData<TaskBoardModel>(
      defaultTaskQueryOptions.queryKey,
      (old) =>
        old ? addTaskOptimistically(old, temporaryTask, sortOptions) : old,
    );

    try {
      const serverTask = await createTask(patch);

      queryClient.setQueryData<TaskBoardModel>(
        defaultTaskQueryOptions.queryKey,
        (old) =>
          old
            ? replaceTask(old, temporaryTask.id, serverTask, sortOptions)
            : old,
      );
      closeForm();
    } catch (error) {
      queryClient.setQueryData<TaskBoardModel>(
        defaultTaskQueryOptions.queryKey,
        (old) => (old ? removeTaskOptimistically(old, temporaryTask.id) : old),
      );
      const message = "생성에 실패해 임시 작업을 제거했습니다.";
      setFormError(`${message} ${getErrorMessage(error)}`);
      toast.error(message);
    }
  };

  const deleteCurrentTask = async (): Promise<void> => {
    if (formState.mode !== "editing") {
      return;
    }

    if (!window.confirm("이 작업을 삭제할까요?")) {
      return;
    }

    await queryClient.cancelQueries({
      queryKey: defaultTaskQueryOptions.queryKey,
    });

    const currentModel = getCurrentBoardModel();
    const previousTask = currentModel.byId[formState.taskId];

    if (!previousTask) {
      setFormError("삭제할 작업을 찾을 수 없습니다.");
      return;
    }

    queryClient.setQueryData<TaskBoardModel>(
      defaultTaskQueryOptions.queryKey,
      (old) => (old ? removeTaskOptimistically(old, formState.taskId) : old),
    );

    try {
      await deleteTask(formState.taskId);
      closeForm();
    } catch (error) {
      queryClient.setQueryData<TaskBoardModel>(
        defaultTaskQueryOptions.queryKey,
        (old) =>
          old ? addTaskOptimistically(old, previousTask, sortOptions) : old,
      );
      const message = "삭제에 실패해 작업을 복원했습니다.";
      setFormError(`${message} ${getErrorMessage(error)}`);
      toast.error(message);
    }
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

  return (
    <>
      <Toaster position="top-center" richColors />
      {statusMessage ? (
        <p className="sr-only" role="status">
          {statusMessage}
        </p>
      ) : null}
      <TaskBoardHeader
        openCreator={openCreator}
        searchText={searchText}
        changeSearchText={changeSearchText}
        sortBy={sortBy}
        changeSortBy={changeSortBy}
        formState={formState}
      />
      {totalTaskCount === 0 ? (
        <p className="hint">표시할 작업이 없습니다.</p>
      ) : null}
      <div className="board">
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            title={col.title}
            status={col.status}
            taskIds={visibleTaskIdsByStatus[col.status]}
            taskById={boardModel.byId}
            onMove={moveTask}
            onEditTask={openEditor}
            dragDisabled={formState.mode !== "idle"}
            scrollToTaskId={scrollTargetByStatus[col.status]}
            scrollToTopVersion={scrollToTopVersion}
          />
        ))}
      </div>
      {formState.mode !== "idle" ? (
        <TaskFormPanel
          formState={formState}
          onChange={updateDraft}
          onCancel={closeForm}
          onSave={() => saveForm()}
          onDelete={() => deleteCurrentTask()}
        />
      ) : null}
    </>
  );
}
