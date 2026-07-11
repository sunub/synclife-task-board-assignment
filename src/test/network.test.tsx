import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "@/App";
import { makeTask } from "./utils";

const server = setupServer(
  http.get("*/api/tasks", () => {
    return HttpResponse.json([makeTask("task-1")]);
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  onlineManager.setOnline(true);
  fireEvent(window, new Event("online"));
  cleanup();
});
afterAll(() => server.close());

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



describe("네트워크 단절 (Offline) 상태 테스트", () => {
  it("네트워크가 끊어지면 보드에 오프라인 상태가 표시되어야 한다", async () => {
    renderApp();

    // 초기에는 태스크가 정상적으로 보여야 함
    expect(await screen.findByText("테스트 작업 task-1")).toBeInTheDocument();

    // 브라우저 오프라인 이벤트 발생
    fireEvent(window, new Event("offline"));

    // 오프라인 인디케이터가 표시되어야 함
    expect(await screen.findByText("오프라인 상태입니다")).toBeInTheDocument();
  });

  it("네트워크가 끊어지면 카드의 드래그 앤 드롭 조작이 잠겨야 한다", async () => {
    server.use(
      http.get("*/api/tasks", () => {
        return HttpResponse.json([makeTask("task-1")]);
      })
    );
    renderApp();
    
    const card = await screen.findByRole("button", { name: "테스트 작업 task-1" });
    expect(card).toHaveAttribute("aria-disabled", "false");

    fireEvent(window, new Event("offline"));

    expect(await screen.findByText("오프라인 상태입니다")).toBeInTheDocument();
    await waitFor(() => {
      expect(card).toHaveAttribute("aria-disabled", "true");
    });
  });
});

