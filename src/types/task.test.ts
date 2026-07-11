import { describe, expect, it } from "vitest";
import type { Task } from "../types/task";
import { getConflictCurrentTaskFromPayload, taskSchema } from "./task";

const validTask: Task = {
  id: "task-1",
  title: "검증 대상 작업",
  description: "설명",
  status: "todo",
  priority: "medium",
  tags: ["qa"],
  assignee: "sunub",
  createdAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 0, 2)).toISOString(),
  version: 1,
};

describe("task schema utilities", () => {
  it("Board conflict payload에 포함된 현재 서버 작업을 검증한다", () => {
    expect(taskSchema.parse(validTask)).toEqual(validTask);
  });

  it("잘못된 status, 날짜, 추가 필드를 거부한다", () => {
    expect(() =>
      taskSchema.parse({
        ...validTask,
        status: "blocked",
      }),
    ).toThrow();
    expect(() =>
      taskSchema.parse({
        ...validTask,
        createdAt: "2026-01-01",
      }),
    ).toThrow();
    expect(() =>
      taskSchema.parse({
        ...validTask,
        unexpected: true,
      }),
    ).toThrow();
  });

  it("409 conflict payload에서 현재 서버 작업만 안전하게 추출한다", () => {
    expect(
      getConflictCurrentTaskFromPayload({
        message: "다른 곳에서 먼저 수정되었습니다.",
        current: validTask,
      }),
    ).toEqual(validTask);

    expect(
      getConflictCurrentTaskFromPayload({
        current: {
          ...validTask,
          version: "1",
        },
      }),
    ).toBeNull();
  });
});
