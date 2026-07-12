import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updateTask } from "@/api/client"
import { defaultTaskQueryOptions } from "@/api/query"
import { applyServerTask, applyTaskPatchOptimistically } from "@/lib/tasks"
import type { BoardMode } from "@/types/board"
import type {
    Task,
    TaskBoardModel,
    TaskEditablePatch,
    TaskSortCriteria,
} from "@/types/task"
import { getConflictCurrentTask, getErrorMessage } from "./utils"

type UpdateTaskVariables = {
    id: string
    patch: TaskEditablePatch
    version: number
}

type UpdateTaskContext = {
    previousTask: Task
}

export function useUpdateTaskMutation({
    mode,
    sortOptions,
    onSuccess,
    onError,
}: {
    mode: BoardMode
    sortOptions: TaskSortCriteria
    onSuccess?: () => void
    onError?: (message: string) => void
}) {
    const queryClient = useQueryClient()
    const queryKey = defaultTaskQueryOptions.queryKey

    return useMutation<Task, unknown, UpdateTaskVariables, UpdateTaskContext>({
        networkMode: "online",
        mutationFn: ({ id, patch, version }) =>
            updateTask(id, {
                ...patch,
                version,
            }),
        onMutate: async ({ id, patch }) => {
            if (mode === "read-only") {
                throw new Error(
                    "오프라인 상태에서는 작업을 수정할 수 없습니다.",
                )
            }

            await queryClient.cancelQueries({ queryKey })

            const model = queryClient.getQueryData<TaskBoardModel>(queryKey)
            const previousTask = model?.byId[id]

            if (!previousTask) {
                throw new Error("수정할 작업을 찾을 수 없습니다.")
            }

            const optimisticUpdatedAt = new Date().toISOString()

            queryClient.setQueryData<TaskBoardModel>(queryKey, (current) =>
                current
                    ? applyTaskPatchOptimistically(
                          current,
                          id,
                          patch,
                          optimisticUpdatedAt,
                          sortOptions,
                      )
                    : current,
            )

            return { previousTask }
        },
        onSuccess: (updatedTask) => {
            queryClient.setQueryData<TaskBoardModel>(queryKey, (current) =>
                current
                    ? applyServerTask(current, updatedTask, sortOptions)
                    : current,
            )
            onSuccess?.()
        },
        onError: (error, _variables, context) => {
            if (!context) return

            const conflictTask = getConflictCurrentTask(error)

            if (conflictTask) {
                queryClient.setQueryData<TaskBoardModel>(queryKey, (current) =>
                    current
                        ? applyServerTask(current, conflictTask, sortOptions)
                        : current,
                )
                onError?.(
                    "다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다.",
                )
                return
            }

            queryClient.setQueryData<TaskBoardModel>(queryKey, (current) =>
                current
                    ? applyServerTask(
                          current,
                          context.previousTask,
                          sortOptions,
                      )
                    : current,
            )
            onError?.(
                `수정에 실패해 이전 상태로 되돌렸습니다. ${getErrorMessage(error)}`,
            )
        },
    })
}
