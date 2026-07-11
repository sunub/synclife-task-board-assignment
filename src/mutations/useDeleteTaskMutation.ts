import { useMutation, useQueryClient } from "@tanstack/react-query"
import { deleteTask } from "../api/client"
import { defaultTaskQueryOptions } from "../api/query"
import { addTaskOptimistically, removeTaskOptimistically } from "../lib/tasks"
import type { Task, TaskBoardModel, TaskSortOptions } from "../types/task"
import { getErrorMessage } from "./utils"

type DeleteTaskVariables = {
    id: string
}

type DeleteTaskContext = {
    previousTask: Task
}

export function useDeleteTaskMutation({
    sortOptions,
    onSuccess,
    onError,
}: {
    sortOptions: TaskSortOptions
    onSuccess?: () => void
    onError?: (message: string) => void
}) {
    const queryClient = useQueryClient()
    const queryKey = defaultTaskQueryOptions.queryKey

    return useMutation<void, unknown, DeleteTaskVariables, DeleteTaskContext>({
        mutationFn: ({ id }) => deleteTask(id),
        onMutate: async ({ id }) => {
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
