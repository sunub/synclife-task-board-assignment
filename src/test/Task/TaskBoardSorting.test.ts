import { describe, expect, it } from "vitest"
import { normalizeTasks } from "@/lib/tasks"
import { makeTask } from "@/test/utils"
import type { Task, TaskBoardModel } from "@/types/task"

type TaskSortKey = "title" | "priority" | "createdAt" | "updatedAt"
type TaskSortDirection = "asc" | "desc"

type SortOptions = {
    sortBy: TaskSortKey
    direction?: TaskSortDirection
}

const normalizeTasksWithSort = (
    tasks: Task[],
    options: SortOptions,
): TaskBoardModel =>
    (
        normalizeTasks as unknown as (
            tasks: Task[],
            options: SortOptions,
        ) => TaskBoardModel
    )(tasks, options)

describe("작업 보드 정렬 기준", () => {
    it("제목 정렬 기준을 선택하면 같은 컬럼의 작업을 가나다순으로 정렬한다", () => {
        const lastTitleTask = makeTask("a-last-title", {
            title: "다음 배포 준비",
        })
        const firstTitleTask = makeTask("b-first-title", {
            title: "가계약서 검토",
        })
        const middleTitleTask = makeTask("c-middle-title", {
            title: "나중 결제 오류 수정",
        })

        const model = normalizeTasksWithSort(
            [lastTitleTask, firstTitleTask, middleTitleTask],
            { sortBy: "title", direction: "asc" },
        )

        expect(model.idsByStatus.todo).toEqual([
            firstTitleTask.id,
            middleTitleTask.id,
            lastTitleTask.id,
        ])
    })

    it("우선순위 정렬 기준을 선택하면 높은 우선순위 작업을 먼저 배치한다", () => {
        const lowPriorityTask = makeTask("a-low-priority", { priority: "low" })
        const highPriorityTask = makeTask("b-high-priority", {
            priority: "high",
        })
        const mediumPriorityTask = makeTask("c-medium-priority", {
            priority: "medium",
        })

        const model = normalizeTasksWithSort(
            [lowPriorityTask, highPriorityTask, mediumPriorityTask],
            { sortBy: "priority", direction: "desc" },
        )

        expect(model.idsByStatus.todo).toEqual([
            highPriorityTask.id,
            mediumPriorityTask.id,
            lowPriorityTask.id,
        ])
    })

    it("생성 날짜 정렬 기준을 선택하면 오래된 작업부터 배치한다", () => {
        const newestTask = makeTask("a-newest-task", {
            createdAt: "2026-01-03T00:00:00.000Z",
        })
        const oldestTask = makeTask("b-oldest-task", {
            createdAt: "2026-01-01T00:00:00.000Z",
        })
        const middleTask = makeTask("c-middle-task", {
            createdAt: "2026-01-02T00:00:00.000Z",
        })

        const model = normalizeTasksWithSort(
            [newestTask, oldestTask, middleTask],
            { sortBy: "createdAt", direction: "asc" },
        )

        expect(model.idsByStatus.todo).toEqual([
            oldestTask.id,
            middleTask.id,
            newestTask.id,
        ])
    })

    it("업데이트 날짜 정렬 기준을 선택하면 최근 수정된 작업부터 배치한다", () => {
        const oldestUpdatedTask = makeTask("a-oldest-updated-task", {
            updatedAt: "2026-01-01T00:00:00.000Z",
        })
        const newestUpdatedTask = makeTask("b-newest-updated-task", {
            updatedAt: "2026-01-03T00:00:00.000Z",
        })
        const middleUpdatedTask = makeTask("c-middle-updated-task", {
            updatedAt: "2026-01-02T00:00:00.000Z",
        })

        const model = normalizeTasksWithSort(
            [oldestUpdatedTask, newestUpdatedTask, middleUpdatedTask],
            { sortBy: "updatedAt", direction: "desc" },
        )

        expect(model.idsByStatus.todo).toEqual([
            newestUpdatedTask.id,
            middleUpdatedTask.id,
            oldestUpdatedTask.id,
        ])
    })
})
