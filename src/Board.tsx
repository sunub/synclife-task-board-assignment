import { useRef } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { defaultTaskQueryOptions } from "./api/query";
import { toast, Toaster } from "sonner";
import { TaskFormPanel } from "./components/TaskFormPanel";
import { TaskBoardHeader } from "./components/TaskBoardHeader/TaskBoardHeader";
import { TaskBoardColumns } from "./components/TaskBoardColumns";
import { useTaskForm } from "./hooks/useTaskForm";
import { useTaskBoardFilters } from "./hooks/useTaskBoardFilters";
import { useTaskBoardInteraction } from "./hooks/useTaskBoardInteraction";
import { useMoveTaskMutation } from "./hooks/mutations/useMoveTaskMutation";
import { useCreateTaskMutation } from "./hooks/mutations/useCreateTaskMutation";
import { useUpdateTaskMutation } from "./hooks/mutations/useUpdateTaskMutation";
import { useDeleteTaskMutation } from "./hooks/mutations/useDeleteTaskMutation";
import type { TaskSortKey } from "./types/task";
import type { BoardMode } from "./types/board";

export default function Board({ mode }: { mode: BoardMode }) {
  const { data: boardModel } = useSuspenseQuery(defaultTaskQueryOptions);
  const formRequestInFlightRef = useRef(false);
  const isReadOnly = mode === "read-only";

  const form = useTaskForm();
  const filters = useTaskBoardFilters(boardModel);
  const interaction = useTaskBoardInteraction();

  const handleMessage = (message: string, isError?: boolean) => {
    interaction.announce(message);
    if (isError) {
      toast.error(message);
    } else {
      toast.info(message);
    }
  };

  const moveMutation = useMoveTaskMutation({
    mode,
    sortOptions: filters.sortOptions,
    onSuccess: (task) => {
      interaction.focusTask(task.status, task.id);
    },
    onMessage: handleMessage,
  });

  const createMutation = useCreateTaskMutation({
    mode,
    sortOptions: filters.sortOptions,
    onSuccess: () => {
      form.close();
    },
    onError: (message) => {
      form.setError(message);
      toast.error(message);
    },
  });

  const updateMutation = useUpdateTaskMutation({
    mode,
    sortOptions: filters.sortOptions,
    onSuccess: () => {
      form.close();
    },
    onError: (message) => {
      form.setError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useDeleteTaskMutation({
    mode,
    sortOptions: filters.sortOptions,
    onSuccess: () => {
      form.close();
    },
    onError: (message) => {
      form.setError(message);
      toast.error(message);
    },
  });

  const changeSearchText = (searchText: string) => {
    filters.changeSearchText(searchText);
    interaction.scrollToTop();
  };

  const changeSortBy = (sortBy: TaskSortKey) => {
    filters.changeSortBy(sortBy);
    interaction.scrollToTop();
  };

  const releaseFormRequest = () => {
    formRequestInFlightRef.current = false;
  };

  const handleSave = () => {
    if (isReadOnly) {
      form.setError("오프라인 상태에서는 작업을 저장할 수 없습니다.");
      return;
    }

    if (formRequestInFlightRef.current || form.state.mode === "idle") {
      return;
    }

    const trimmedTitle = form.state.draft.title.trim();

    if (!trimmedTitle) {
      form.setError("제목을 입력해 주세요.");
      return;
    }

    const patch = {
      title: trimmedTitle,
      description: form.state.draft.description.trim() || undefined,
      priority: form.state.draft.priority,
      status: form.state.draft.status,
    };

    if (form.state.mode === "editing") {
      const task = boardModel.byId[form.state.taskId];
      if (!task) {
        form.setError("수정할 작업을 찾을 수 없습니다.");
        return;
      }
      formRequestInFlightRef.current = true;
      updateMutation.mutate(
        {
          id: form.state.taskId,
          patch,
          version: task.version,
        },
        { onSettled: releaseFormRequest },
      );
      return;
    }

    const now = new Date().toISOString();
    const temporaryId = `temporary-${crypto.randomUUID()}`;
    const optimisticTask = {
      id: temporaryId,
      title: patch.title,
      description: patch.description,
      status: patch.status,
      priority: patch.priority,
      tags: [],
      assignee: undefined,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };

    formRequestInFlightRef.current = true;
    createMutation.mutate(
      { patch, temporaryId, optimisticTask },
      { onSettled: releaseFormRequest },
    );
  };

  const handleDelete = () => {
    if (isReadOnly) {
      form.setError("오프라인 상태에서는 작업을 삭제할 수 없습니다.");
      return;
    }

    if (formRequestInFlightRef.current || form.state.mode !== "editing") {
      return;
    }

    if (!window.confirm("이 작업을 삭제할까요?")) {
      return;
    }

    formRequestInFlightRef.current = true;
    deleteMutation.mutate(
      { id: form.state.taskId },
      { onSettled: releaseFormRequest },
    );
  };

  const totalTaskCount =
    boardModel.idsByStatus.todo.length +
    boardModel.idsByStatus["in-progress"].length +
    boardModel.idsByStatus.done.length;
  const isFormSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;
  const isCardInteractionDisabled = isReadOnly || form.isOpen;

  return (
    <>
      <Toaster position="top-center" richColors />

      {interaction.statusMessage ? (
        <p className="sr-only" role="status">
          {interaction.statusMessage}
        </p>
      ) : null}

      <TaskBoardHeader
        searchText={filters.searchText}
        sortBy={filters.sortBy}
        changeSearchText={changeSearchText}
        changeSortBy={changeSortBy}
        createDisabled={isReadOnly}
        openCreator={form.openCreator}
      />

      {totalTaskCount === 0 ? (
        <p className="hint">표시할 작업이 없습니다.</p>
      ) : null}

      <TaskBoardColumns
        boardModel={boardModel}
        visibleTaskIdsByStatus={filters.visibleTaskIdsByStatus}
        onMove={moveMutation.moveTask}
        onEditTask={form.openEditor}
        dragDisabled={isCardInteractionDisabled}
        editDisabled={isReadOnly}
        scrollTargetByStatus={interaction.scrollTargetByStatus}
        scrollToTopVersion={interaction.scrollToTopVersion}
      />

      {form.state.mode !== "idle" ? (
        <TaskFormPanel
          formState={form.state}
          onChange={form.updateDraft}
          onCancel={form.close}
          onSave={handleSave}
          onDelete={handleDelete}
          isSubmitting={isFormSubmitting}
          isDeleting={deleteMutation.isPending}
        />
      ) : null}
    </>
  );
}
