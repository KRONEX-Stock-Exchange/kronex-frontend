import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// 렌더링 중 예외가 발생해도 화면이 검게 비지 않고 재시도 UI를 보여준다.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#0e0f13] text-zinc-300">
          <p className="text-sm">화면을 불러오는 중 문제가 발생했습니다.</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[#f6465d] px-4 py-2 text-sm font-semibold text-white"
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
