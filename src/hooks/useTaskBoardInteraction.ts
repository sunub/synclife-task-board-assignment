import { useState } from "react"
import type { Status } from "../types/task"

export function useTaskBoardInteraction() {
    const [scrollToTopVersion, setScrollToTopVersion] = useState(0)
    const [scrollTargetByStatus, setScrollTargetByStatus] = useState<
        Partial<Record<Status, string>>
    >({})
    const [statusMessage, setStatusMessage] = useState<string | null>(null)

    const scrollToTop = () => {
        setScrollToTopVersion((version) => version + 1)
    }

    const focusTask = (status: Status, taskId: string) => {
        setScrollTargetByStatus((current) => ({
            ...current,
            [status]: taskId,
        }))
    }

    const announce = (message: string) => {
        setStatusMessage(message)
    }

    return {
        scrollToTopVersion,
        scrollTargetByStatus,
        statusMessage,
        scrollToTop,
        focusTask,
        announce,
    }
}
