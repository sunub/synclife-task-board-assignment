import { QueryClient } from "@tanstack/react-query"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { makeTask } from "../test/utils"
import { defaultTaskQueryOptions } from "./query"

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

afterEach(() => server.resetHandlers())

afterAll(() => server.close())

describe("defaultTaskQueryOptions", () => {
    it("서버 작업 목록을 보드 읽기 모델로 변환한다", async () => {
        const todoTask = makeTask("todo-task", {
            status: "todo",
            updatedAt: "2026-01-03T00:00:00.000Z",
        })
        const doneTask = makeTask("done-task", {
            status: "done",
            updatedAt: "2026-01-04T00:00:00.000Z",
        })

        server.use(
            http.get("*/api/tasks", () =>
                HttpResponse.json([doneTask, todoTask]),
            ),
        )

        const queryFn = defaultTaskQueryOptions.queryFn

        expect(queryFn).toBeTypeOf("function")

        if (!queryFn) {
            throw new Error("defaultTaskQueryOptions.queryFn이 필요합니다.")
        }

        const context = {
            client: new QueryClient(),
            queryKey: ["tasks"],
            meta: undefined,
            signal: new AbortController().signal,
        }

        const model = await queryFn(context)

        expect(model).toEqual({
            byId: {
                [todoTask.id]: todoTask,
                [doneTask.id]: doneTask,
            },
            idsByStatus: {
                todo: [todoTask.id],
                "in-progress": [],
                done: [doneTask.id],
            },
        })
    })
})
