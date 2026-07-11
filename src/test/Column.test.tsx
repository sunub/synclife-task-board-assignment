import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Column } from "../components/Column";
import { makeTask, makeTaskMap } from "./utils";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    estimateSize: (index: number) => number;
    getItemKey: (index: number) => string;
  }) => ({
    getTotalSize: () => options.count * 80,
    getVirtualItems: () =>
      Array.from({ length: Math.min(options.count, 10) }, (_, index) => ({
        index,
        key: options.getItemKey(index),
        size: options.estimateSize(index),
        start: index * 80,
      })),
    scrollToOffset: () => undefined,
  }),
}));

describe("Column 선언적 표시", () => {
  it("컬럼은 제목과 현재 표시 중인 작업 수를 접근 가능한 영역 이름으로 제공한다", () => {
    const firstTask = makeTask("first-task");
    const secondTask = makeTask("second-task");

    render(
      <Column
        title="To Do"
        status="todo"
        taskIds={[firstTask.id, secondTask.id]}
        taskById={makeTaskMap([firstTask, secondTask])}
        onMove={vi.fn()}
      />,
    );

    const column = screen.getByRole("region", { name: "To Do 2" });

    expect(within(column).getByRole("heading", { name: "To Do 2" }))
      .toBeInTheDocument();
  });

  it("작업이 없는 컬럼은 컬럼 경계 안에서 빈 상태를 보여준다", () => {
    render(
      <Column
        title="Done"
        status="done"
        taskIds={[]}
        taskById={{}}
        onMove={vi.fn()}
      />,
    );

    expect(
      within(screen.getByRole("region", { name: "Done 0" })).getByText(
        "이 컬럼에는 작업이 없습니다.",
      ),
    ).toBeInTheDocument();
  });

  it("대량 작업이 있어도 모든 카드를 DOM에 한 번에 렌더링하지 않는다", () => {
    const tasks = Array.from({ length: 1000 }, (_, index) =>
      makeTask(`task-${index + 1}`),
    );

    render(
      <Column
        title="To Do"
        status="todo"
        taskIds={tasks.map((task) => task.id)}
        taskById={makeTaskMap(tasks)}
        onMove={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("article").length).toBeLessThan(tasks.length);
  });
});
