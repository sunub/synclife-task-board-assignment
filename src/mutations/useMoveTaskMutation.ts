import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"
import { updateTask } from "../api/client"
import { defaultTaskQueryOptions } from "../api/query"
import { applyServerTask, moveTaskOptimistically } from "../lib/tasks"
import type {
    MoveTaskContext,
    MoveTaskVariables,
    Status,
    Task,
    TaskBoardModel,
    TaskSortOptions,
} from "../types/task"
import { getConflictCurrentTask } from "./utils"

export function useMoveTaskMutation({
    sortOptions,
    onSuccess,
    onMessage,
}: {
    sortOptions: TaskSortOptions
    onSuccess?: (task: Task) => void
    onMessage?: (message: string, isError?: boolean) => void
}) {
    const queryClient = useQueryClient()
    const latestMoveSequenceByTaskId = useRef(new Map<string, number>())
    const confirmedTaskByTaskId = useRef(new Map<string, Task>())
    const inFlightMoveCountByTaskId = useRef(new Map<string, number>())
    const queryKey = defaultTaskQueryOptions.queryKey

    const rememberConfirmedTask = (task: Task) => {
        const confirmedTask = confirmedTaskByTaskId.current.get(task.id)

        if (!confirmedTask || task.version > confirmedTask.version) {
            confirmedTaskByTaskId.current.set(task.id, task)
        }
    }

    const finishMove = (taskId: string) => {
        const nextCount =
            (inFlightMoveCountByTaskId.current.get(taskId) ?? 1) - 1

        if (nextCount <= 0) {
            inFlightMoveCountByTaskId.current.delete(taskId)
            confirmedTaskByTaskId.current.delete(taskId)
            return
        }

        inFlightMoveCountByTaskId.current.set(taskId, nextCount)
    }

    const mutation = useMutation<
        Task,
        unknown,
        MoveTaskVariables,
        MoveTaskContext
    >({
        mutationFn: ({ id, status, version }) =>
            updateTask(id, { status, version }),
        onMutate: async ({ id, status }) => {
            await queryClient.cancelQueries({ queryKey })

            const currentModel =
                queryClient.getQueryData<TaskBoardModel>(queryKey)
            const previousTask = currentModel?.byId[id]

            if (!previousTask) {
                throw new Error("이동할 작업을 찾을 수 없습니다.")
            }

            inFlightMoveCountByTaskId.current.set(
                id,
                (inFlightMoveCountByTaskId.current.get(id) ?? 0) + 1,
            )
            if (!confirmedTaskByTaskId.current.has(id)) {
                confirmedTaskByTaskId.current.set(id, previousTask)
            }

            const sequence =
                (latestMoveSequenceByTaskId.current.get(id) ?? 0) + 1
            latestMoveSequenceByTaskId.current.set(id, sequence)
            const updatedAt = new Date().toISOString()

            queryClient.setQueryData<TaskBoardModel>(queryKey, (old) =>
                old
                    ? moveTaskOptimistically(
                          old,
                          id,
                          status,
                          updatedAt,
                          sortOptions,
                      )
                    : old,
            )

            return {
                taskId: id,
                sequence,
                previousTask,
            }
        },
        onSuccess: (updatedTask, _variables, context) => {
            rememberConfirmedTask(updatedTask)

            if (
                latestMoveSequenceByTaskId.current.get(context.taskId) !==
                context.sequence
            ) {
                finishMove(context.taskId)
                return
            }

            queryClient.setQueryData<TaskBoardModel>(queryKey, (old) =>
                old ? applyServerTask(old, updatedTask, sortOptions) : old,
            )

            onSuccess?.(updatedTask)
            finishMove(context.taskId)
        },
        onError: (error, variables, context) => {
            if (!context) return
            if (
                latestMoveSequenceByTaskId.current.get(context.taskId) !==
                context.sequence
            ) {
                const staleCurrentTask = getConflictCurrentTask(error)

                if (staleCurrentTask) {
                    rememberConfirmedTask(staleCurrentTask)
                }
                finishMove(context.taskId)
                return
            }

            const currentTask = getConflictCurrentTask(error)

            if (currentTask) {
                rememberConfirmedTask(currentTask)

                if (
                    currentTask.status !== variables.status &&
                    !variables.rebased
                ) {
                    queryClient.setQueryData<TaskBoardModel>(queryKey, (old) =>
                        old
                            ? applyServerTask(old, currentTask, sortOptions)
                            : old,
                    )
                    mutation.mutate({
                        id: context.taskId,
                        status: variables.status,
                        version: currentTask.version,
                        rebased: true,
                    })
                    finishMove(context.taskId)
                    return
                }

                queryClient.setQueryData<TaskBoardModel>(queryKey, (old) =>
                    old ? applyServerTask(old, currentTask, sortOptions) : old,
                )
                onMessage?.(
                    "다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다.",
                    true,
                )
                finishMove(context.taskId)
                return
            }

            const confirmedTask =
                confirmedTaskByTaskId.current.get(context.taskId) ??
                context.previousTask

            queryClient.setQueryData<TaskBoardModel>(queryKey, (old) =>
                old ? applyServerTask(old, confirmedTask, sortOptions) : old,
            )
            onMessage?.("이동에 실패해 이전 상태로 되돌렸습니다.", false)
            finishMove(context.taskId)
        },
    })

    const moveTask = (id: string, status: Status) => {
        const currentModel = queryClient.getQueryData<TaskBoardModel>(queryKey)
        const task = currentModel?.byId[id]

        if (!task || task.status === status) {
            return
        }

        mutation.mutate({ id, status, version: task.version })
    }

    return { moveTask, mutation }
}
