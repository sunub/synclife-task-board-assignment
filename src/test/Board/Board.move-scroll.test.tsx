import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { TaskSortKey } from "@/types/task";
import {
  createBoardServer,
  dragTaskToColumn,
  makeTask,
  renderBoard,
  scrollToIndexMock,
  scrollToOffsetMock,
  startBoardServer,
} from "./utils";

const server = createBoardServer();

startBoardServer(server, () => {
  vi.restoreAllMocks();
});

const sortLabels: Record<TaskSortKey, string> = {
  title: "제목 순",
  priority: "우선순위",
  createdAt: "생성 날짜",
  updatedAt: "업데이트 날짜",
};

function changeSortOrder(sortKeys: TaskSortKey[]): void {
  for (const removeButton of screen.queryAllByRole("button", {
    name: /정렬 기준 제거$/,
  })) {
    fireEvent.click(removeButton);
  }

  scrollToOffsetMock.mockClear();
  scrollToIndexMock.mockClear();

  const sortButton = screen.getByRole("button", {
    name: /^정렬 기준/,
  });

  if (sortButton.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(sortButton);
  }

  for (const sortKey of sortKeys) {
    fireEvent.click(screen.getByRole("option", { name: sortLabels[sortKey] }));
  }
}

describe("보드 이동 후 스크롤", () => {
  it("다른 컬럼으로 이동한 카드는 정렬된 최종 위치가 보이도록 스크롤된다", async () => {
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => undefined);
    const movingTask = makeTask("moving-task", {
      title: "중간 위치로 이동할 작업",
      status: "todo",
    });
    const doneTasks = Array.from({ length: 30 }, (_, index) =>
      makeTask(`done-task-${index + 1}`, {
        title: `완료 작업 ${String(index + 1).padStart(2, "0")}`,
        status: "done",
      }),
    );

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

    renderBoard([movingTask, ...doneTasks]);

    changeSortOrder(["title"]);
    scrollToOffsetMock.mockClear();
    dragTaskToColumn(movingTask, "done");

    await waitFor(() => {
      expect(screen.getByText(movingTask.title)).toBeInTheDocument();
      expect(scrollIntoView).toHaveBeenCalled();
    });
    expect(scrollToOffsetMock).not.toHaveBeenCalled();
  });

  it.each([
    ["제목 순", "title"],
    ["우선순위", "priority"],
    ["생성 날짜", "createdAt"],
    ["업데이트 날짜", "updatedAt"],
  ])(
    "정렬 기준을 %s으로 바꾸면 각 컬럼 스크롤을 top으로 되돌리고 이전 위치를 복원하지 않는다",
    async (_label, sortValue) => {
      const tasks = [
        makeTask("todo-task", {
          title: "가나다 작업",
          status: "todo",
          priority: "low",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-05T00:00:00.000Z",
        }),
        makeTask("in-progress-task", {
          title: "라마바 작업",
          status: "in-progress",
          priority: "medium",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-04T00:00:00.000Z",
        }),
        makeTask("done-task", {
          title: "사아자 작업",
          status: "done",
          priority: "high",
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ];

      renderBoard(tasks);

      if (sortValue === "updatedAt") {
        changeSortOrder(["title"]);
      }

      scrollToOffsetMock.mockClear();
      scrollToIndexMock.mockClear();

      changeSortOrder([sortValue as TaskSortKey]);

      await waitFor(() => {
        expect(scrollToOffsetMock).toHaveBeenCalledTimes(3);
      });
      expect(scrollToOffsetMock).toHaveBeenCalledWith(0, { align: "start" });
      expect(scrollToIndexMock).not.toHaveBeenCalled();
    },
  );

  it("검색어가 바뀌면 각 컬럼 스크롤을 top으로 되돌리고 이전 위치를 복원하지 않는다", async () => {
    const tasks = [
      makeTask("todo-task", {
        title: "검색 대상 작업",
        status: "todo",
      }),
      makeTask("in-progress-task", {
        title: "진행 중 작업",
        status: "in-progress",
      }),
      makeTask("done-task", {
        title: "완료된 작업",
        status: "done",
      }),
    ];

    renderBoard(tasks);
    scrollToOffsetMock.mockClear();
    scrollToIndexMock.mockClear();

    fireEvent.change(screen.getByRole("searchbox", { name: "작업 검색" }), {
      target: { value: "검색" },
    });

    await waitFor(() => {
      expect(scrollToOffsetMock).toHaveBeenCalledTimes(3);
    });
    expect(scrollToOffsetMock).toHaveBeenCalledWith(0, { align: "start" });
    expect(scrollToIndexMock).not.toHaveBeenCalled();
  });
});
