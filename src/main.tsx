import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";

async function enableMocking() {
  const { worker } = await import("./mocks/browser");
  // service worker 등록 경로는 배포 base 를 따라갑니다 (GitHub Pages 대응).
  return worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledRequest: "bypass",
  });
}

const queryClient = new QueryClient();

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
      <QueryClientProvider client={queryClient}>
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </QueryClientProvider>
  );
});
