import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import type { SetupServer } from "msw/node"
import { setupServer } from "msw/node"
import { createElement, Suspense } from "react"
import { afterAll, afterEach, beforeAll, vi } from "vitest"
import { defaultTaskQueryOptions } from "@/api/query"
import Board from "@/Board"
import { normalizeTasks } from "@/lib/tasks"
import { makeTask as makeTaskFixture } from "@/test/utils"
import type { Status, Task } from "@/types/task"

type DragEndHandler = (event: {
    canceled: boolean
    operation: {
        source: { id: string } | null
        target: { id: string } | null
    }
}) => void

let activeDragId: string | null = null
let dragEndHandler: DragEndHandler | undefined

vi.mock("@dnd-kit/react", () => ({
    DragDropProvider: ({
        children,
        onDragEnd,
    }: {
        children: React.ReactNode
        onDragEnd?: DragEndHandler
    }) => {
        dragEndHandler = onDragEnd
        return children
    },
    useDraggable: ({ id, disabled }: { id: string; disabled?: boolean }) => ({
        ref: (element: HTMLElement | null) => {
            if (!element || disabled) {
                return
            }

            element.draggable = true
            element.ondragstart = () => {
                activeDragId = id
            }
        },
    }),
    useDroppable: ({ id, disabled }: { id: string; disabled?: boolean }) => ({
        isDropTarget: false,
        ref: (element: HTMLElement | null) => {
            if (!element || disabled) {
                return
            }

            element.ondrop = () => {
                dragEndHandler?.({
                    canceled: false,
                    operation: {
                        source: activeDragId ? { id: activeDragId } : null,
                        target: { id },
                    },
                })
                activeDragId = null
            }
        },
    }),
}))

export const scrollToIndexMock = vi.fn()
export const scrollToOffsetMock = vi.fn()

vi.mock("@tanstack/react-virtual", () => ({
    useVirtualizer: (options: {
        count: number
        estimateSize: (index: number) => number
        getItemKey: (index: number) => string
    }) => {
        const visibleIndexes = Array.from(
            { length: Math.min(options.count, 10) },
            (_, index) => index,
        )

        if (options.count > 10) {
            visibleIndexes.push(options.count - 1)
        }

        return {
            getTotalSize: () => options.count * 80,
            getVirtualItems: () =>
                visibleIndexes.map((index) => ({
                    index,
                    key: options.getItemKey(index),
                    size: options.estimateSize(index),
                    start: index * 80,
                })),
            scrollToIndex: scrollToIndexMock,
            scrollToOffset: scrollToOffsetMock,
        }
    },
}))

let nextTaskNumber = 1

const makeSequencedTask = (overrides: Partial<Task> = {}): Task => {
    const taskNumber = nextTaskNumber++
    const createdAt = new Date(Date.UTC(2026, 0, taskNumber)).toISOString()

    return {
        id: crypto.randomUUID(),
        title: `테스트 태스크 ${taskNumber}`,
        description: `테스트 설명 ${taskNumber}`,
        status: "todo",
        priority: "medium",
        tags: [],
        assignee: "unassigned",
        createdAt,
        updatedAt: createdAt,
        version: 1,
        ...overrides,
    }
}

export function makeTask(overrides?: Partial<Task>): Task
export function makeTask(id: string, overrides?: Partial<Task>): Task
export function makeTask(
    idOrOverrides: string | Partial<Task> = {},
    overrides: Partial<Task> = {},
): Task {
    if (typeof idOrOverrides === "string") {
        return makeTaskFixture(idOrOverrides, overrides)
    }

    return makeSequencedTask(idOrOverrides)
}

export function resetTaskSequence(): void {
    nextTaskNumber = 1
}

export function makeDragDataTransfer(): DataTransfer {
    const data = new Map<string, string>()

    return {
        setData: (format: string, value: string) => {
            data.set(format, value)
        },
        getData: (format: string) => data.get(format) ?? "",
        clearData: (format?: string) => {
            if (format) {
                data.delete(format)
                return
            }

            data.clear()
        },
    } as DataTransfer
}

export function createQueryClient(tasks: Task[] = []): QueryClient {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })

    if (tasks.length > 0) {
        queryClient.setQueryData(
            defaultTaskQueryOptions.queryKey,
            normalizeTasks(tasks),
        )
    }

    return queryClient
}

export function renderBoard(
    tasksOrQueryClient: Task[] | QueryClient = [],
): void {
    const queryClient = Array.isArray(tasksOrQueryClient)
        ? createQueryClient(tasksOrQueryClient)
        : tasksOrQueryClient

    render(
        createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(
                Suspense,
                { fallback: createElement("p", null, "불러오는 중...") },
                createElement(Board),
            ),
        ),
    )
}

export function getColumn(title: string): HTMLElement {
    const heading = screen.getByRole("heading", { name: new RegExp(title) })
    const column = heading.closest("section")

    if (!column) {
        throw new Error(`${title} 컬럼을 찾을 수 없습니다.`)
    }

    return column
}

export function dragTaskToColumn(task: Task, status: Status): void {
    const card = screen.getByText(task.title).closest("article")
    const targetColumnTitle: Record<Status, string> = {
        todo: "To Do",
        "in-progress": "In Progress",
        done: "Done",
    }

    if (!card) {
        throw new Error(`${task.title} 카드를 찾을 수 없습니다.`)
    }

    const dataTransfer = makeDragDataTransfer()
    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.drop(getColumn(targetColumnTitle[status]), { dataTransfer })
}

export function expectTaskInColumn(task: Task, title: string): void {
    expect(within(getColumn(title)).getByText(task.title)).toBeInTheDocument()
}

export function createBoardServer(): SetupServer {
    return setupServer()
}

export function startBoardServer(
    server: SetupServer,
    afterReset?: () => void,
): void {
    beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

    afterEach(() => {
        server.resetHandlers()
        resetTaskSequence()
        scrollToIndexMock.mockReset()
        scrollToOffsetMock.mockReset()
        afterReset?.()
    })

    afterAll(() => server.close())
}
