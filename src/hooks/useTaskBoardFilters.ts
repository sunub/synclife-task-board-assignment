import { useEffect, useMemo, useState } from "react"
import { debounce } from "@/utils/debounce"
import { selectVisibleTaskIdsByStatus } from "../lib/tasks"
import type {
    TaskBoardModel,
    TaskSortKey,
    TaskSortOptions,
} from "../types/task"

export const SORT_OPTIONS: Record<TaskSortKey, TaskSortOptions> = {
    title: { sortBy: "title", direction: "asc" },
    priority: { sortBy: "priority", direction: "desc" },
    createdAt: { sortBy: "createdAt", direction: "asc" },
    updatedAt: { sortBy: "updatedAt", direction: "desc" },
}

export function useTaskBoardFilters(boardModel: TaskBoardModel) {
    const [searchText, setSearchText] = useState("")
    const [filterSearchText, setFilterSearchText] = useState("")
    const [sortBy, setSortBy] = useState<TaskSortKey>("updatedAt")
    const sortOptions = SORT_OPTIONS[sortBy]

    const debouncedSetFilterSearchText = useMemo(
        () =>
            debounce((nextSearchText: string) => {
                setFilterSearchText(nextSearchText)
            }, 300),
        [],
    )

    useEffect(() => {
        debouncedSetFilterSearchText(searchText)
        return () => {
            debouncedSetFilterSearchText.cancel()
        }
    }, [searchText, debouncedSetFilterSearchText])

    const visibleTaskIdsByStatus = useMemo(
        () =>
            selectVisibleTaskIdsByStatus(boardModel, {
                searchText: filterSearchText,
                sortOptions,
            }),
        [boardModel, filterSearchText, sortOptions],
    )

    return {
        searchText,
        sortBy,
        sortOptions,
        visibleTaskIdsByStatus,
        changeSearchText: setSearchText,
        changeSortBy: setSortBy,
    }
}
