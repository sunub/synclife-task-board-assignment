import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Task } from "../../types/task";
import { defaultTaskQueryOptions } from "../../api/query";
import { normalizeTasks } from "../../lib/tasks";
import {
  createBoardServer,
  createQueryClient,
  dragTaskToColumn,
  expectTaskInColumn,
  getColumn,
  makeTask,
  renderBoard,
  startBoardServer,
} from "./utils";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

const server = createBoardServer();

startBoardServer(server);

describe("보드 렌더링", () => {
  it("정상 조회 결과가 비어 있으면 보드 빈 상태를 보여준다", async () => {
    server.use(http.get("*/api/tasks", () => HttpResponse.json([])));

    renderBoard();

    expect(
      await screen.findByText("표시할 작업이 없습니다."),
    ).toBeInTheDocument();
  });

  it("쿼리 캐시에 있는 보드 읽기 모델로 작업을 렌더링한다", async () => {
    const cachedTask = makeTask({ title: "캐시에 있는 작업", status: "done" });
    const queryClient = createQueryClient();

    queryClient.setQueryData(
      defaultTaskQueryOptions.queryKey,
      normalizeTasks([cachedTask]),
    );

    renderBoard(queryClient);

    expectTaskInColumn(cachedTask, "Done");
  });

  it("특정 컬럼에 작업이 없으면 컬럼 빈 상태를 보여준다", async () => {
    const doneTask = makeTask({ status: "done" });

    server.use(http.get("*/api/tasks", () => HttpResponse.json([doneTask])));

    renderBoard();

    await screen.findByText(doneTask.title);

    expect(
      within(getColumn("To Do")).getByText("이 컬럼에는 작업이 없습니다."),
    ).toBeInTheDocument();
    expect(
      within(getColumn("In Progress")).getByText(
        "이 컬럼에는 작업이 없습니다.",
      ),
    ).toBeInTheDocument();
  });
});

describe("보드 검색 기능", () => {
  it("검색어가 바뀌면 쿼리 캐시를 바꾸지 않고 보이는 작업 id만 필터링한다", async () => {
    const matchingTask = makeTask({ title: "결제 버그 수정", status: "todo" });
    const hiddenTask = makeTask({ title: "문서 정리", status: "todo" });
    const queryClient = createQueryClient();

    queryClient.setQueryData(
      defaultTaskQueryOptions.queryKey,
      normalizeTasks([matchingTask, hiddenTask]),
    );

    renderBoard(queryClient);

    expectTaskInColumn(matchingTask, "To Do");
    expectTaskInColumn(hiddenTask, "To Do");

    fireEvent.change(screen.getByRole("searchbox", { name: "작업 검색" }), {
      target: { value: "결제" },
    });

    expectTaskInColumn(matchingTask, "To Do");
    expect(
      within(getColumn("To Do")).queryByText(hiddenTask.title),
    ).not.toBeInTheDocument();
    expect(queryClient.getQueryData(defaultTaskQueryOptions.queryKey)).toEqual(
      normalizeTasks([matchingTask, hiddenTask]),
    );
  });
});

describe("보드 비동기 이동 처리", () => {
  it("이동 성공 후 전체 작업 목록을 다시 조회하지 않고 서버가 반환한 작업만 반영한다", async () => {
    const movingTask = makeTask({ status: "todo", version: 1 });
    const serverUpdatedTask: Task = {
      ...movingTask,
      status: "done",
      updatedAt: new Date(Date.UTC(2026, 0, 3)).toISOString(),
      version: 2,
    };
    let getRequestCount = 0;

    server.use(
      http.get("*/api/tasks", () => {
        getRequestCount += 1;
        return HttpResponse.json([movingTask]);
      }),
      http.patch("*/api/tasks/:id", () => HttpResponse.json(serverUpdatedTask)),
    );

    renderBoard();

    await screen.findByText(movingTask.title);

    dragTaskToColumn(movingTask, "done");

    await waitFor(() => expectTaskInColumn(serverUpdatedTask, "Done"));
    expect(getRequestCount).toBe(1);
  });

  it("같은 카드를 빠르게 연속 이동하면 이전 요청 실패는 최신 이동 상태를 롤백하지 않는다", async () => {
    const movingTask = makeTask({ status: "todo", version: 1 });
    const initialTasks = [movingTask];
    const firstPatch = createDeferred<Response>();
    const secondPatch = createDeferred<Response>();
    const patchRequests: Array<{
      id: string;
      body: Partial<Task> & { version?: number };
    }> = [];
    const patchResponses = [firstPatch, secondPatch];

    server.use(
      http.get("*/api/tasks", () => HttpResponse.json(initialTasks)),
      http.patch("*/api/tasks/:id", async ({ request, params }) => {
        const body = (await request.json()) as Partial<Task> & {
          version?: number;
        };
        patchRequests.push({ id: params.id as string, body });
        const response = patchResponses.shift();

        if (!response) {
          return HttpResponse.json(
            { message: "예상하지 못한 요청입니다." },
            { status: 500 },
          );
        }

        return response.promise;
      }),
    );

    renderBoard();

    await screen.findByText(movingTask.title);

    dragTaskToColumn(movingTask, "in-progress");
    dragTaskToColumn(movingTask, "done");

    await waitFor(() => {
      expect(patchRequests).toEqual([
        {
          id: movingTask.id,
          body: expect.objectContaining({
            status: "in-progress",
            version: movingTask.version,
          }),
        },
        {
          id: movingTask.id,
          body: expect.objectContaining({
            status: "done",
            version: movingTask.version,
          }),
        },
      ]);
    });
    expectTaskInColumn(movingTask, "Done");

    secondPatch.resolve(
      HttpResponse.json({
        ...movingTask,
        status: "done",
        updatedAt: new Date(Date.UTC(2026, 0, 3)).toISOString(),
        version: movingTask.version + 1,
      }),
    );

    await waitFor(() => expectTaskInColumn(movingTask, "Done"));

    firstPatch.resolve(
      HttpResponse.json(
        { message: "일시적인 서버 오류입니다. 다시 시도해 주세요." },
        { status: 500 },
      ),
    );

    await waitFor(() => expectTaskInColumn(movingTask, "Done"));
    expect(
      within(getColumn("To Do")).queryByText(movingTask.title),
    ).not.toBeInTheDocument();
    expect(
      within(getColumn("In Progress")).queryByText(movingTask.title),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("같은 카드를 빠르게 연속 이동하면 이전 요청 성공은 최신 이동 상태를 덮지 않는다", async () => {
    const movingTask = makeTask({ status: "todo", version: 1 });
    const firstPatch = createDeferred<Response>();
    const secondPatch = createDeferred<Response>();
    const patchResponses = [firstPatch, secondPatch];

    server.use(
      http.get("*/api/tasks", () => HttpResponse.json([movingTask])),
      http.patch("*/api/tasks/:id", () => {
        const response = patchResponses.shift();

        if (!response) {
          return HttpResponse.json(
            { message: "예상하지 못한 요청입니다." },
            { status: 500 },
          );
        }

        return response.promise;
      }),
    );

    renderBoard();

    await screen.findByText(movingTask.title);

    dragTaskToColumn(movingTask, "in-progress");
    dragTaskToColumn(movingTask, "done");

    secondPatch.resolve(
      HttpResponse.json({
        ...movingTask,
        status: "done",
        updatedAt: new Date(Date.UTC(2026, 0, 3)).toISOString(),
        version: movingTask.version + 2,
      }),
    );

    await waitFor(() => expectTaskInColumn(movingTask, "Done"));

    firstPatch.resolve(
      HttpResponse.json({
        ...movingTask,
        status: "in-progress",
        updatedAt: new Date(Date.UTC(2026, 0, 2)).toISOString(),
        version: movingTask.version + 1,
      }),
    );

    await waitFor(() => expectTaskInColumn(movingTask, "Done"));
    expect(
      within(getColumn("In Progress")).queryByText(movingTask.title),
    ).not.toBeInTheDocument();
  });

  it("최신 이동 요청에서 409 충돌이 발생하면 서버 최신 작업을 반영하고 안내한다", async () => {
    const movingTask = makeTask({ status: "todo", version: 1 });
    const serverCurrentTask: Task = {
      ...movingTask,
      status: "in-progress",
      updatedAt: new Date(Date.UTC(2026, 0, 2)).toISOString(),
      version: 2,
    };

    server.use(
      http.get("*/api/tasks", () => HttpResponse.json([movingTask])),
      http.patch("*/api/tasks/:id", () =>
        HttpResponse.json(
          {
            message: "다른 곳에서 먼저 수정되었습니다.",
            current: serverCurrentTask,
          },
          { status: 409 },
        ),
      ),
    );

    renderBoard();

    await screen.findByText(movingTask.title);

    dragTaskToColumn(movingTask, "done");

    await waitFor(() => expectTaskInColumn(serverCurrentTask, "In Progress"));
    expect(
      within(getColumn("Done")).queryByText(movingTask.title),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "다른 변경이 먼저 반영되어 서버 최신 상태로 갱신했습니다.",
    );
  });

  it("이전 이동 요청에서 409 충돌이 발생하면 서버 최신 작업과 안내 문구를 무시한다", async () => {
    const movingTask = makeTask({ status: "todo", version: 1 });
    const firstPatch = createDeferred<Response>();
    const secondPatch = createDeferred<Response>();
    const patchResponses = [firstPatch, secondPatch];
    const staleServerCurrentTask: Task = {
      ...movingTask,
      status: "todo",
      updatedAt: new Date(Date.UTC(2026, 0, 4)).toISOString(),
      version: 2,
    };

    server.use(
      http.get("*/api/tasks", () => HttpResponse.json([movingTask])),
      http.patch("*/api/tasks/:id", () => {
        const response = patchResponses.shift();

        if (!response) {
          return HttpResponse.json(
            { message: "예상하지 못한 요청입니다." },
            { status: 500 },
          );
        }

        return response.promise;
      }),
    );

    renderBoard();

    await screen.findByText(movingTask.title);

    dragTaskToColumn(movingTask, "in-progress");
    dragTaskToColumn(movingTask, "done");

    secondPatch.resolve(
      HttpResponse.json({
        ...movingTask,
        status: "done",
        updatedAt: new Date(Date.UTC(2026, 0, 3)).toISOString(),
        version: 3,
      }),
    );

    await waitFor(() => expectTaskInColumn(movingTask, "Done"));

    firstPatch.resolve(
      HttpResponse.json(
        {
          message: "다른 곳에서 먼저 수정되었습니다.",
          current: staleServerCurrentTask,
        },
        { status: 409 },
      ),
    );

    await waitFor(() => expectTaskInColumn(movingTask, "Done"));
    expect(
      within(getColumn("To Do")).queryByText(movingTask.title),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("최신 이동 요청이 실패하면 이전 작업으로 되돌리고 안내한다", async () => {
    const movingTask = makeTask({ status: "todo", version: 1 });

    server.use(
      http.get("*/api/tasks", () => HttpResponse.json([movingTask])),
      http.patch("*/api/tasks/:id", () =>
        HttpResponse.json(
          { message: "일시적인 서버 오류입니다. 다시 시도해 주세요." },
          { status: 500 },
        ),
      ),
    );

    renderBoard();

    await screen.findByText(movingTask.title);

    dragTaskToColumn(movingTask, "done");

    await waitFor(() => expectTaskInColumn(movingTask, "To Do"));
    expect(
      within(getColumn("Done")).queryByText(movingTask.title),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "이동에 실패해 이전 상태로 되돌렸습니다.",
    );
  });
});
