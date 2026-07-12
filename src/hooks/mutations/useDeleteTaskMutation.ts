import { useMutation, useQueryClient } from "@tanstack/react-query"
import { deleteTask } from "@/api/client"
import { defaultTaskQueryOptions } from "@/api/query"
import { addTaskOptimistically, removeTaskOptimistically } from "@/lib/tasks"
import type { BoardMode } from "@/types/board"
import type { Task, TaskBoardModel, TaskSortOptions } from "@/types/task"
import { getErrorMessage } from "./utils"

type DeleteTaskVariables = {
    id: string
}

type DeleteTaskContext = {
    previousTask: Task
}

export function useDeleteTaskMutation({
    mode,
    sortOptions,
    onSuccess,
    onError,
}: {
    mode: BoardMode
    sortOptions: TaskSortOptions
    onSuccess?: () => void
    onError?: (message: string) => void
}) {
    const queryClient = useQueryClient()
    const queryKey = defaultTaskQueryOptions.queryKey

    return useMutation<void, unknown, DeleteTaskVariables, DeleteTaskContext>({
        networkMode: "online",
        mutationFn: ({ id }) => deleteTask(id),
        onMutate: async ({ id }) => {
            if (mode === "read-only") {
                throw new Error(
                    "오프라인 상태에서는 작업을 삭제할 수 없습니다.",
                )
            }

            await queryClient.cancelQueries({ queryKey })

            const model = queryClient.getQueryData<TaskBoardModel>(queryKey)
            const previousTask = model?.byId[id]

            if (!previousTask) {
                throw new Error("삭제할 작업을 찾을 수 없습니다.")
            }

            queryClient.setQueryData<TaskBoardModel>(queryKey, (current) =>
                current ? removeTaskOptimistically(current, id) : current,
            )

            return { previousTask }
        },
        onSuccess: () => {
            onSuccess?.()
        },
        onError: (error, _variables, context) => {
            if (!context) return
            queryClient.setQueryData<TaskBoardModel>(queryKey, (current) =>
                current
                    ? addTaskOptimistically(
                          current,
                          context.previousTask,
                          sortOptions,
                      )
                    : current,
            )
            onError?.(
                `삭제에 실패해 작업을 복원했습니다. ${getErrorMessage(error)}`,
            )
        },
    })
}
