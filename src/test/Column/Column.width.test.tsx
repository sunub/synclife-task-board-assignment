import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Column } from "@/components/Column";
import { estimateCardHeight } from "@/components/utils";
import { makeTask, makeTaskMap } from "@/test/utils";

let resizeObserverCallback:
  | ResizeObserverCallback
  | null = null;
const scrollToOffset = vi.fn();
const scrollToIndex = vi.fn();

vi.mock("@/components/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/utils")>();

  return {
    ...actual,
    estimateCardHeight: vi.fn(() => 96),
  };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    estimateSize: (index: number) => number;
    getItemKey: (index: number) => string;
  }) => ({
    getTotalSize: () => options.count * 96,
    getVirtualItems: () =>
      Array.from({ length: Math.min(options.count, 1) }, (_, index) => ({
        index,
        key: options.getItemKey(index),
        size: options.estimateSize(index),
        start: index * 96,
      })),
    scrollToIndex,
    scrollToOffset,
  }),
}));

function resizeColumnBody(width: number): void {
  act(() => {
    const entry: ResizeObserverEntry = {
      target: document.createElement("div"),
      contentRect: {
        width,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      },
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    };
    const observer: ResizeObserver = {
      observe: () => {},
      unobserve: () => {},
      disconnect: () => {},
    };
    resizeObserverCallback?.([entry], observer);
  });
}

describe("Column 너비 기반 카드 높이 계산", () => {
  beforeEach(() => {
    resizeObserverCallback = null;
    vi.mocked(estimateCardHeight).mockClear();
    scrollToIndex.mockClear();
    scrollToOffset.mockClear();

    globalThis.ResizeObserver = class ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback;
      }

      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  });

  it("컬럼은 실제 컬럼 너비를 기준으로 카드 높이를 추정한다", () => {
    const task = makeTask("wide-aware-task", {
      title: "컬럼 너비에 따라 줄바꿈 높이가 달라지는 긴 작업 제목",
    });

    render(
      <Column
        title="To Do"
        status="todo"
        taskIds={[task.id]}
        taskById={makeTaskMap([task])}
      />,
    );

    resizeColumnBody(480);

    expect(estimateCardHeight).toHaveBeenLastCalledWith(task, 480);
  });

  it("컬럼 너비가 바뀌면 같은 작업도 새 너비로 높이를 다시 추정한다", () => {
    const task = makeTask("resized-task", {
      title: "좁은 컬럼에서는 여러 줄로 표시되어야 하는 긴 작업 제목",
    });

    render(
      <Column
        title="To Do"
        status="todo"
        taskIds={[task.id]}
        taskById={makeTaskMap([task])}
      />,
    );

    resizeColumnBody(240);
    resizeColumnBody(520);

    expect(estimateCardHeight).toHaveBeenCalledWith(task, 240);
    expect(estimateCardHeight).toHaveBeenLastCalledWith(task, 520);
  });

  it("컬럼 너비 변경은 스크롤을 top으로 되돌리거나 특정 카드 위치로 이동하지 않는다", () => {
    const task = makeTask("scroll-stable-task", {
      title: "너비 변경은 같은 목록의 레이아웃 변화로만 처리한다",
    });

    render(
      <Column
        title="To Do"
        status="todo"
        taskIds={[task.id]}
        taskById={makeTaskMap([task])}
      />,
    );

    scrollToOffset.mockClear();
    scrollToIndex.mockClear();
    resizeColumnBody(360);

    expect(scrollToOffset).not.toHaveBeenCalled();
    expect(scrollToIndex).not.toHaveBeenCalled();
  });
});
