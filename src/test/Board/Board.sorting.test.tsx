import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Task, TaskSortKey } from "@/types/task";
import { getColumn, makeTask, renderBoard } from "./utils";

const sortLabels: Record<TaskSortKey, string> = {
  title: "제목 순",
  priority: "우선순위",
  createdAt: "생성 날짜",
  updatedAt: "업데이트 날짜",
};

function selectSortCriteria(sortKeys: TaskSortKey[]): void {
  const sortButton = screen.getByRole("button", {
    name: /^정렬 기준/,
  });

  fireEvent.click(sortButton);

  for (const sortKey of sortKeys) {
    fireEvent.click(screen.getByRole("option", { name: sortLabels[sortKey] }));
  }
}

function expectTaskOrder(tasks: Task[]): void {
  const todoColumn = getColumn("To Do");

  expect(
    Array.from(todoColumn.querySelectorAll("[data-task-id]")).map((element) =>
      element.getAttribute("data-task-id"),
    ),
  ).toEqual(tasks.map((task) => task.id));
}

describe("보드 다중 정렬 기준", () => {
  it("제목 순, 생성 날짜, 업데이트 날짜를 선택한 순서대로 적용한다", () => {
    const oldUpdatedTask = makeTask("a-old-updated-task", {
      title: "가 같은 제목",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newUpdatedTask = makeTask("b-new-updated-task", {
      title: "가 같은 제목",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    const laterCreatedTask = makeTask("c-later-created-task", {
      title: "가 같은 제목",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const laterTitleTask = makeTask("d-later-title-task", {
      title: "나 다른 제목",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });

    renderBoard([
      laterTitleTask,
      oldUpdatedTask,
      laterCreatedTask,
      newUpdatedTask,
    ]);

    selectSortCriteria(["title", "createdAt", "updatedAt"]);

    expect(
      screen.getAllByRole("button", { name: /정렬 기준 제거$/ }).map((button) =>
        button.textContent?.replace(/\s+/g, ""),
      ),
    ).toEqual(["1제목순", "2생성날짜", "3업데이트날짜"]);
    expectTaskOrder([
      newUpdatedTask,
      oldUpdatedTask,
      laterCreatedTask,
      laterTitleTask,
    ]);
  });
});
