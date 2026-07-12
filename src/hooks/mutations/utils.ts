import { ApiError } from "@/api/client"
import { getConflictCurrentTaskFromPayload, type Task } from "@/types/task"

export function getConflictCurrentTask(error: unknown): Task | null {
    if (!(error instanceof ApiError) || error.status !== 409) {
        return null
    }
    return getConflictCurrentTaskFromPayload(error.payload)
}

export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "요청에 실패했습니다."
}
