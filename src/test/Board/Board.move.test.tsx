import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Status } from "@/types/task";
import {
  createBoardServer,
  dragTaskToColumn,
  getColumn,
  makeTask,
  renderBoard,
  startBoardServer,
  isPartialTaskWithStatus,
} from "./utils";

const server = createBoardServer();

startBoardServer(server);

describe("보드 카드 이동 요청", () => {
  it("다른 컬럼으로 카드를 드롭할 때만 상태 변경 네트워크 요청을 보낸다", async () => {
    const todoTask = makeTask("todo-task", { status: "todo" });
    const patchRequests: Array<{ id: string; status: Status }> = [];

    server.use(
      http.patch("*/api/tasks/:id", async ({ params, request }) => {
        const json = await request.json();
        const body = isPartialTaskWithStatus(json) ? json : {};
        patchRequests.push({
          id: typeof params.id === "string" ? params.id : "",
          status: body.status ?? "todo",
        });

        return HttpResponse.json({
          ...todoTask,
          status: body.status,
          version: todoTask.version + 1,
        });
      }),
    );

    renderBoard([todoTask]);

    dragTaskToColumn(todoTask, "todo");
    expect(patchRequests).toEqual([]);

    dragTaskToColumn(todoTask, "done");

    await waitFor(() =>
      expect(patchRequests).toEqual([{ id: todoTask.id, status: "done" }]),
    );
  });

  it("이동된 카드는 선택한 정렬 기준에 맞는 최종 위치에 배치된다", async () => {
    const movingTask = makeTask("moving-task", {
      title: "나중에 보여야 하는 작업",
      status: "todo",
    });
    const firstDoneTask = makeTask("first-done-task", {
      title: "가장 먼저 보여야 하는 작업",
      status: "done",
    });
    const lastDoneTask = makeTask("last-done-task", {
      title: "하단에 보여야 하는 작업",
      status: "done",
    });

    server.use(
      http.patch("*/api/tasks/:id", () =>
        HttpResponse.json({
          ...movingTask,
          status: "done",
          updatedAt: "2026-01-10T00:00:00.000Z",
          version: movingTask.version + 1,
        }),
      ),
    );

    renderBoard([movingTask, firstDoneTask, lastDoneTask]);

    fireEvent.change(screen.getByRole("combobox", { name: "정렬 기준" }), {
      target: { value: "title" },
    });
    dragTaskToColumn(movingTask, "done");

    await waitFor(() => {
      const doneColumn = getColumn("Done");
      expect(
        within(doneColumn)
          .getByText(firstDoneTask.title)
          .compareDocumentPosition(
            within(doneColumn).getByText(movingTask.title),
          ),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(
        within(doneColumn)
          .getByText(movingTask.title)
          .compareDocumentPosition(
            within(doneColumn).getByText(lastDoneTask.title),
          ),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });
});
