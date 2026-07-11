import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createTask } from "../api/client"
import { defaultTaskQueryOptions } from "../api/query"
import {
    addTaskOptimistically,
    removeTaskOptimistically,
    replaceTask,
} from "../lib/tasks"
import type {
    Task,
    TaskBoardModel,
    TaskEditablePatch,
    TaskSortOptions,
} from "../types/task"
import { getErrorMessage } from "./utils"

type CreateTaskVariables = {
    patch: TaskEditablePatch
    temporaryId: string
    optimisticTask: Task
}

export function useCreateTaskMutation({
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

    return useMutation<Task, unknown, CreateTaskVariables, void>({
        mutationFn: ({ patch }) => createTask(patch),
        onMutate: async ({ optimisticTask }) => {
            await queryClient.cancelQueries({ queryKey })

            queryClient.setQueryData<TaskBoardModel>(queryKey, (current) =>
                current
                    ? addTaskOptimistically(
                          current,
                          optimisticTask,
                          sortOptions,
                      )
                    : current,
            )
        },
        onSuccess: (serverTask, { temporaryId }) => {
            queryClient.setQueryData<TaskBoardModel>(queryKey, (current) =>
                current
                    ? replaceTask(current, temporaryId, serverTask, sortOptions)
                    : current,
            )
            onSuccess?.()
        },
        onError: (error, { temporaryId }) => {
            queryClient.setQueryData<TaskBoardModel>(queryKey, (current) =>
                current
                    ? removeTaskOptimistically(current, temporaryId)
                    : current,
            )
            onError?.(
                `생성에 실패해 임시 작업을 제거했습니다. ${getErrorMessage(error)}`,
            )
        },
    })
}
