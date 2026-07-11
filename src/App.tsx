import { ErrorBoundary } from "react-error-boundary";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import Board from "./Board";
import { Suspense, useState, useEffect } from "react";

export default function App() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Task Board</h1>
        <p className="hint">
          스타터 baseline입니다. 요구사항은 <strong>과제 명세서</strong>를
          참고하세요.
        </p>
      </header>
      {isOffline && (
        <div className="offline-indicator" style={{ backgroundColor: '#ffcccc', padding: '10px', textAlign: 'center', color: '#c00' }}>
          오프라인 상태입니다
        </div>
      )}
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            onReset={reset}
            fallbackRender={({ error, resetErrorBoundary }) => (
              <div role="alert" className="error">
                <p>앗, 오류가 발생했습니다:</p>
                <pre>
                  {error instanceof Error
                    ? error.message
                    : "알 수 없는 오류입니다."}
                </pre>
                <button onClick={resetErrorBoundary}>다시 시도</button>
              </div>
            )}
          >
            <Suspense fallback={<p className="hint">불러오는 중…</p>}>
              <Board isOffline={isOffline} />
            </Suspense>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </div>
  );
}
