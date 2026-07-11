import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import type { Status, Task } from './types/task';
import {
  getConflictCurrentTaskFromPayload,
  type MoveTaskContext,
  type MoveTaskVariables,
  type TaskColumn,
} from './types/task';
import { ApiError, createTask, deleteTask, updateTask } from './api/client';
import { defaultTaskQueryOptions } from './api/query';
import { Column } from './components/Column';
import {
  addTaskOptimistically,
  applyTaskPatchOptimistically,
  applyServerTask,
  moveTaskOptimistically,
  removeTaskOptimistically,
  replaceTask,
  selectVisibleTaskIdsByStatus,
  type TaskBoardModel,
  type TaskEditablePatch,
  type TaskSortKey,
  type TaskSortOptions,
} from './lib/tasks';
import { toast, Toaster } from 'sonner';
import type { Priority } from './types/task';

const COLUMNS: TaskColumn[] = [
  { status: 'todo', title: 'To Do' },
  { status: 'in-progress', title: 'In Progress' },
  { status: 'done', title: 'Done' },
];

const SORT_OPTIONS: Record<TaskSortKey, TaskSortOptions> = {
  title: { sortBy: 'title', direction: 'asc' },
  priority: { sortBy: 'priority', direction: 'desc' },
  createdAt: { sortBy: 'createdAt', direction: 'asc' },
  updatedAt: { sortBy: 'updatedAt', direction: 'desc' },
};

type TaskFormDraft = {
  title: string;
  description: string;
  priority: Priority;
  status: Status;
};

type TaskFormState =
  | { mode: 'idle' }
  | {
      mode: 'editing';
      taskId: string;
      draft: TaskFormDraft;
      errorMessage?: string;
    }
  | {
      mode: 'creating';
      draft: TaskFormDraft;
      errorMessage?: string;
    };

const EMPTY_CREATE_DRAFT: TaskFormDraft = {
  title: '',
  description: '',
  priority: 'medium',
  status: 'todo',
};

function createDraftFromTask(task: Task): TaskFormDraft {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '요청에 실패했습니다.';
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
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<TaskSortKey>('updatedAt');
  const [scrollToTopVersion, setScrollToTopVersion] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scrollTargetByStatus, setScrollTargetByStatus] = useState<Partial<Record<Status, string>>>(
    {}
  );
  const [formState, setFormState] = useState<TaskFormState>({ mode: 'idle' });
  const sortOptions = SORT_OPTIONS[sortBy];
  const moveTaskMutation = useMutation<Task, unknown, MoveTaskVariables, MoveTaskContext>({
    mutationFn: ({ id, status, version }) => updateTask(id, { status, version }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({
        queryKey: defaultTaskQueryOptions.queryKey,
      });

      const currentModel =
        queryClient.getQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey) ?? boardModel;
      const previousTask = currentModel.byId[id];
      const sequence = (latestMoveSequenceByTaskId.current.get(id) ?? 0) + 1;
      latestMoveSequenceByTaskId.current.set(id, sequence);
      const updatedAt = new Date().toISOString();

      queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
        old ? moveTaskOptimistically(old, id, status, updatedAt, sortOptions) : old
      );

      return {
        taskId: id,
        sequence,
        previousTask,
      };
    },
    onSuccess: (updatedTask, _variables, context) => {
      if (latestMoveSequenceByTaskId.current.get(context.taskId) !== context.sequence) {
        return;
      }

      queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
        old ? applyServerTask(old, updatedTask, sortOptions) : old
      );
      setScrollTargetByStatus(previous => ({
        ...previous,
        [updatedTask.status]: updatedTask.id,
      }));
    },
    onError: (error, _variables, context) => {
      if (!context) {
        return;
      }
      if (latestMoveSequenceByTaskId.current.get(context.taskId) !== context.sequence) {
        return;
      }

      const currentTask = getConflictCurrentTask(error);

      if (currentTask) {
        queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
          old ? applyServerTask(old, currentTask, sortOptions) : old
        );
        const message = '다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다.';
        setStatusMessage(message);
        toast.error(message);
        return;
      }

      queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
        old ? applyServerTask(old, context.previousTask, sortOptions) : old
      );
      const message = '이동에 실패해 이전 상태로 되돌렸습니다.';
      setStatusMessage(message);
      toast.info(message);
    },
  });

  const moveTask = (id: string, status: Status) => {
    const currentModel =
      queryClient.getQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey) ?? boardModel;
    const task = currentModel.byId[id];

    if (!task || task.status === status) {
      return;
    }

    moveTaskMutation.mutate({ id, status, version: task.version });
  };

  const getCurrentBoardModel = (): TaskBoardModel =>
    queryClient.getQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey) ?? boardModel;

  const openEditor = (task: Task): void => {
    setFormState({
      mode: 'editing',
      taskId: task.id,
      draft: createDraftFromTask(task),
    });
  };

  const openCreator = (initialStatus: Status = 'todo'): void => {
    setFormState({
      mode: 'creating',
      draft: {
        ...EMPTY_CREATE_DRAFT,
        status: initialStatus,
      },
    });
  };

  const updateDraft = (patch: Partial<TaskFormDraft>): void => {
    setFormState(current => {
      if (current.mode === 'idle') return current;

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

  const setFormError = (message: string): void => {
    setFormState(current =>
      current.mode === 'idle'
        ? current
        : {
            ...current,
            errorMessage: message,
          }
    );
  };

  const closeForm = (): void => {
    setFormState({ mode: 'idle' });
  };

  const saveForm = async (): Promise<void> => {
    if (formState.mode === 'idle') {
      return;
    }

    const trimmedTitle = formState.draft.title.trim();

    if (!trimmedTitle) {
      setFormError('제목을 입력해 주세요.');
      return;
    }

    const patch: TaskEditablePatch = {
      title: trimmedTitle,
      description: formState.draft.description.trim() || undefined,
      priority: formState.draft.priority,
      status: formState.draft.status,
    };

    void queryClient.cancelQueries({
      queryKey: defaultTaskQueryOptions.queryKey,
    });

    if (formState.mode === 'editing') {
      const currentModel = getCurrentBoardModel();
      const previousTask = currentModel.byId[formState.taskId];

      if (!previousTask) {
        setFormError('수정할 작업을 찾을 수 없습니다.');
        return;
      }

      const optimisticUpdatedAt = new Date().toISOString();

      queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
        old
          ? applyTaskPatchOptimistically(
              old,
              formState.taskId,
              patch,
              optimisticUpdatedAt,
              sortOptions
            )
          : old
      );

      try {
        const updatedTask = await updateTask(formState.taskId, {
          ...patch,
          version: previousTask.version,
        });

        queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
          old ? applyServerTask(old, updatedTask, sortOptions) : old
        );
        closeForm();
      } catch (error) {
        const currentTask = getConflictCurrentTask(error);

        if (currentTask) {
          queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
            old ? applyServerTask(old, currentTask, sortOptions) : old
          );
          const message = '다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다.';
          setFormError(message);
          toast.error(message);
          return;
        }

        queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
          old ? applyServerTask(old, previousTask, sortOptions) : old
        );
        const message = '수정에 실패해 이전 상태로 되돌렸습니다.';
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
      status: patch.status ?? 'todo',
      priority: patch.priority ?? 'medium',
      tags: [],
      assignee: undefined,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };

    queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
      old ? addTaskOptimistically(old, temporaryTask, sortOptions) : old
    );

    try {
      const serverTask = await createTask(patch);

      queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
        old ? replaceTask(old, temporaryTask.id, serverTask, sortOptions) : old
      );
      closeForm();
    } catch (error) {
      queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
        old ? removeTaskOptimistically(old, temporaryTask.id) : old
      );
      const message = '생성에 실패해 임시 작업을 제거했습니다.';
      setFormError(`${message} ${getErrorMessage(error)}`);
      toast.error(message);
    }
  };

  const deleteCurrentTask = async (): Promise<void> => {
    if (formState.mode !== 'editing') {
      return;
    }

    if (!window.confirm('이 작업을 삭제할까요?')) {
      return;
    }

    void queryClient.cancelQueries({
      queryKey: defaultTaskQueryOptions.queryKey,
    });

    const currentModel = getCurrentBoardModel();
    const previousTask = currentModel.byId[formState.taskId];

    if (!previousTask) {
      setFormError('삭제할 작업을 찾을 수 없습니다.');
      return;
    }

    queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
      old ? removeTaskOptimistically(old, formState.taskId) : old
    );

    try {
      await deleteTask(formState.taskId);
      closeForm();
    } catch (error) {
      queryClient.setQueryData<TaskBoardModel>(defaultTaskQueryOptions.queryKey, old =>
        old ? addTaskOptimistically(old, previousTask, sortOptions) : old
      );
      const message = '삭제에 실패해 작업을 복원했습니다.';
      setFormError(`${message} ${getErrorMessage(error)}`);
      toast.error(message);
    }
  };

  const changeSortBy = (nextSortBy: TaskSortKey) => {
    if (sortBy === nextSortBy) {
      return;
    }

    setSortBy(nextSortBy);
    setScrollToTopVersion(currentVersion => currentVersion + 1);
  };

  const changeSearchText = (nextSearchText: string) => {
    if (searchText === nextSearchText) {
      return;
    }

    setSearchText(nextSearchText);
    setScrollToTopVersion(currentVersion => currentVersion + 1);
  };

  const totalTaskCount =
    boardModel.idsByStatus.todo.length +
    boardModel.idsByStatus['in-progress'].length +
    boardModel.idsByStatus.done.length;

  const visibleTaskIdsByStatus = useMemo(
    () => selectVisibleTaskIdsByStatus(boardModel, { searchText, sortOptions }),
    [boardModel, searchText, sortOptions]
  );

  return (
    <>
      <Toaster position="top-center" richColors />
      {statusMessage ? (
        <p className="sr-only" role="status">
          {statusMessage}
        </p>
      ) : null}
      <div className="board-toolbar">
        <button type="button" onClick={() => openCreator()}>
          작업 만들기
        </button>
        <input
          aria-label="작업 검색"
          type="search"
          value={searchText}
          onChange={event => changeSearchText(event.target.value)}
        />
        <select
          aria-label="정렬 기준"
          value={sortBy}
          onChange={event => changeSortBy(event.target.value as TaskSortKey)}
        >
          <option value="title">제목 순</option>
          <option value="priority">우선순위</option>
          <option value="createdAt">생성 날짜</option>
          <option value="updatedAt">업데이트 날짜</option>
        </select>
      </div>
      {totalTaskCount === 0 ? <p className="hint">표시할 작업이 없습니다.</p> : null}
      <div className="board">
        {COLUMNS.map(col => (
          <Column
            key={col.status}
            title={col.title}
            status={col.status}
            taskIds={visibleTaskIdsByStatus[col.status]}
            taskById={boardModel.byId}
            onMove={moveTask}
            onEditTask={openEditor}
            dragDisabled={formState.mode !== 'idle'}
            scrollToTaskId={scrollTargetByStatus[col.status]}
            scrollToTopVersion={scrollToTopVersion}
          />
        ))}
      </div>
      {formState.mode !== 'idle' ? (
        <TaskFormPanel
          formState={formState}
          onChange={updateDraft}
          onCancel={closeForm}
          onSave={() => void saveForm()}
          onDelete={() => void deleteCurrentTask()}
        />
      ) : null}
    </>
  );
}

interface TaskFormPanelProps {
  formState: Exclude<TaskFormState, { mode: 'idle' }>;
  onChange: (patch: Partial<TaskFormDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}

function TaskFormPanel({ formState, onChange, onCancel, onSave, onDelete }: TaskFormPanelProps) {
  const title = formState.mode === 'editing' ? '작업 수정' : '작업 생성';

  return (
    <div
      className="task-panel-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <aside
        aria-label={title}
        className="task-panel"
        role="dialog"
        onKeyDown={event => {
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
      >
        <div className="task-panel-header">
          <h2>{title}</h2>
          <button type="button" aria-label="닫기" onClick={onCancel}>
            닫기
          </button>
        </div>

        <label className="task-panel-field">
          <span>제목</span>
          <textarea
            aria-label="제목"
            value={formState.draft.title}
            onChange={event => onChange({ title: event.target.value })}
          />
        </label>

        <label className="task-panel-field">
          <span>설명</span>
          <textarea
            aria-label="설명"
            value={formState.draft.description}
            onChange={event => onChange({ description: event.target.value })}
          />
        </label>

        <label className="task-panel-field">
          <span>우선순위</span>
          <select
            aria-label="우선순위"
            value={formState.draft.priority}
            onChange={event => onChange({ priority: event.target.value as Priority })}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label className="task-panel-field">
          <span>상태</span>
          <select
            aria-label="상태"
            value={formState.draft.status}
            onChange={event => onChange({ status: event.target.value as Status })}
          >
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </label>

        {formState.errorMessage ? (
          <p className="task-panel-error" role="alert">
            {formState.errorMessage}
          </p>
        ) : null}

        <div className="task-panel-actions">
          {formState.mode === 'editing' ? (
            <button type="button" className="danger-button" onClick={onDelete}>
              삭제
            </button>
          ) : null}
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="primary-button" onClick={onSave}>
            저장
          </button>
        </div>
      </aside>
    </div>
  );
}
