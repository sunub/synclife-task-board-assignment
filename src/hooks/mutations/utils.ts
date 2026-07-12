import { ApiError } from "@/api/client"
import { getConflictCurrentTaskFromPayload, type Task } from "@/types/task"

const isConflictApiError = (error: unknown): error is ApiError => {
    return error instanceof ApiError && error.status === 409
}

export function getConflictCurrentTask(error: unknown): Task | null {
    if (!isConflictApiError(error)) {
        return null
    }
    return getConflictCurrentTaskFromPayload(error.payload)
}

export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "요청에 실패했습니다."
}
