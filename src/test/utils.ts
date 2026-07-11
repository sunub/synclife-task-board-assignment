import type { Task } from "@/types/task"

export const DEFAULT_TASK_TIMESTAMP = "2026-01-01T00:00:00.000Z"

export function makeTask(
    id: string = "test-task",
    overrides: Partial<Task> = {},
): Task {
    return {
        id,
        title: `테스트 작업 ${id}`,
        status: "todo",
        priority: "medium",
        createdAt: DEFAULT_TASK_TIMESTAMP,
        updatedAt: DEFAULT_TASK_TIMESTAMP,
        version: 1,
        ...overrides,
    }
}

export function makeTaskMap(tasks: Task[]): Record<string, Task> {
    return Object.fromEntries(tasks.map((task) => [task.id, task]))
}
