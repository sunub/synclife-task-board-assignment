import { useReducer } from "react"
import type { TaskFormDraft, TaskFormState } from "../types/form"
import type { Status, Task } from "../types/task"

type TaskFormAction =
    | { type: "creatorOpened"; status: Status }
    | { type: "editorOpened"; task: Task }
    | { type: "draftChanged"; patch: Partial<TaskFormDraft> }
    | { type: "errorSet"; message: string }
    | { type: "closed" }

const EMPTY_CREATE_DRAFT: TaskFormDraft = {
    title: "",
    description: "",
    priority: "medium",
    status: "todo",
}

function createDraftFromTask(task: Task): TaskFormDraft {
    return {
        title: task.title,
        description: task.description ?? "",
        priority: task.priority,
        status: task.status,
    }
}

function taskFormReducer(
    state: TaskFormState,
    action: TaskFormAction,
): TaskFormState {
    switch (action.type) {
        case "creatorOpened":
            return {
                mode: "creating",
                draft: {
                    ...EMPTY_CREATE_DRAFT,
                    status: action.status,
                },
            }

        case "editorOpened":
            return {
                mode: "editing",
                taskId: action.task.id,
                draft: createDraftFromTask(action.task),
            }

        case "draftChanged":
            if (state.mode === "idle") {
                return state
            }

            return {
                ...state,
                draft: {
                    ...state.draft,
                    ...action.patch,
                },
                errorMessage: undefined,
            }

        case "errorSet":
            if (state.mode === "idle") {
                return state
            }

            return {
                ...state,
                errorMessage: action.message,
            }

        case "closed":
            return { mode: "idle" }
    }
}

export function useTaskForm() {
    const [state, dispatch] = useReducer(taskFormReducer, {
        mode: "idle",
    })

    const openCreator = (status: Status = "todo") => {
        dispatch({ type: "creatorOpened", status })
    }

    const openEditor = (task: Task) => {
        dispatch({ type: "editorOpened", task })
    }

    const updateDraft = (patch: Partial<TaskFormDraft>) => {
        dispatch({ type: "draftChanged", patch })
    }

    const setError = (message: string) => {
        dispatch({ type: "errorSet", message })
    }

    const close = () => {
        dispatch({ type: "closed" })
    }

    return {
        state,
        isOpen: state.mode !== "idle",
        openCreator,
        openEditor,
        updateDraft,
        setError,
        close,
    }
}
