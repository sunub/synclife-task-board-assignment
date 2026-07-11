import type { Priority, Status } from "./task"

export type TaskFormDraft = {
    title: string
    description: string
    priority: Priority
    status: Status
}

export type TaskFormState =
    | { mode: "idle" }
    | {
          mode: "editing"
          taskId: string
          draft: TaskFormDraft
          errorMessage?: string
      }
    | {
          mode: "creating"
          draft: TaskFormDraft
          errorMessage?: string
      }
