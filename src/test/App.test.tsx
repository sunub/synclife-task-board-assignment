import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "@/App";
import { makeTask } from "./utils";

const server = setupServer();

function renderApp(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => server.resetHandlers());

afterAll(() => server.close());

describe("App 초기 조회 상태", () => {
  it("초기 조회 실패를 에러 경계에서 보여주고 다시 시도하면 보드를 렌더링한다", async () => {
    const recoveredTask = makeTask("recovered-task", {
      title: "재시도 후 작업 recovered-task",
    });
    let requestCount = 0;

    server.use(
      http.get("*/api/tasks", () => {
        requestCount += 1;

        if (requestCount === 1) {
          return HttpResponse.json(
            { message: "초기 조회 실패" },
            { status: 500 },
          );
        }

        return HttpResponse.json([recoveredTask]);
      }),
    );

    renderApp();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "초기 조회 실패",
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() =>
      expect(screen.getByText(recoveredTask.title)).toBeInTheDocument(),
    );
    expect(requestCount).toBe(2);
  });
});
