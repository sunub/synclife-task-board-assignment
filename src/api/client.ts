import type { Task } from "../types/task"

// base 경로 하위로 요청해야 GitHub Pages 서브경로 배포 시에도
// MSW 서비스워커(scope=base) 가 요청을 가로챌 수 있습니다.
const BASE = `${import.meta.env.BASE_URL}api`

/** 서버 오류를 담아 던지는 에러. status/payload 로 409 충돌 시 서버 최신 상태에 접근할 수 있습니다. */
export class ApiError extends Error {
    status: number
    payload: unknown
    constructor(status: number, message: string, payload: unknown) {
        super(message)
        this.name = "ApiError"
        this.status = status
        this.payload = payload
    }
}

async function handleResponseError(res: Response): Promise<void> {
    if (!res.ok) {
        let payload: unknown = null
        try {
            payload = await res.json()
        } catch {
            /* body 없음 */
        }
        const isErrorPayload = (p: unknown): p is { message: string } =>
            typeof p === "object" &&
            p !== null &&
            "message" in p &&
            typeof (p as { message: unknown }).message === "string"

        const message = isErrorPayload(payload)
            ? payload.message
            : `요청 실패 (${res.status})`
        throw new ApiError(res.status, message, payload)
    }
}

export async function getTasks(signal?: AbortSignal): Promise<Task[]> {
    const res = await fetch(`${BASE}/tasks`, { signal })
    await handleResponseError(res)
    const data: Task[] = await res.json()
    return data
}

export async function createTask(input: Partial<Task>): Promise<Task> {
    const res = await fetch(`${BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    })
    await handleResponseError(res)
    const data: Task = await res.json()
    return data
}

export async function updateTask(
    id: string,
    patch: Partial<Task> & { version: number },
): Promise<Task> {
    const res = await fetch(`${BASE}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    })
    await handleResponseError(res)
    const data: Task = await res.json()
    return data
}

export async function deleteTask(id: string): Promise<void> {
    const res = await fetch(`${BASE}/tasks/${id}`, { method: "DELETE" })
    await handleResponseError(res)
}
