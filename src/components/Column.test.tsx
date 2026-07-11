import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Column } from "./Column";
import { makeTask } from "../test/utils";

describe("Column", () => {
  it("작업 id 목록과 작업 사전으로 컬럼 순서대로 카드를 렌더링한다", () => {
    const firstTask = makeTask("first-task", { title: "첫 번째 작업" });
    const secondTask = makeTask("second-task", { title: "두 번째 작업" });

    render(
      <Column
        title="To Do"
        status="todo"
        taskIds={[secondTask.id, firstTask.id]}
        taskById={{
          [firstTask.id]: firstTask,
          [secondTask.id]: secondTask,
        }}
        onMove={vi.fn()}
      />,
    );

    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(
      screen
        .getByText("두 번째 작업")
        .compareDocumentPosition(screen.getByText("첫 번째 작업")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
