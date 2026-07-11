import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateCardHeight } from "../components/utils";
import { makeTask } from "./utils";
import { layout } from "@chenglou/pretext";

vi.mock("@chenglou/pretext", () => ({
  prepare: vi.fn((text: string) => ({ text })),
  layout: vi.fn((_prepared: unknown, textWidth: number) => ({
    height: textWidth,
  })),
}));

describe("카드 높이 layout cache", () => {
  beforeEach(() => {
    vi.mocked(layout).mockClear();
  });

  it("같은 작업과 같은 카드 너비의 높이 계산은 layout 결과를 재사용한다", () => {
    const task = makeTask("cached-height-task", {
      title: "같은 너비에서는 한 번 계산한 제목 높이를 재사용한다",
    });

    estimateCardHeight(task, 320);
    estimateCardHeight(task, 320);

    expect(layout).toHaveBeenCalledTimes(1);
  });

  it("같은 작업이라도 카드 너비가 다르면 다른 text width로 높이를 다시 계산한다", () => {
    const task = makeTask("width-specific-cache-task", {
      title: "너비가 바뀌면 줄바꿈 결과도 달라진다",
    });

    estimateCardHeight(task, 280);
    estimateCardHeight(task, 520);

    expect(layout).toHaveBeenCalledTimes(2);
  });
});
