import { Component, type ErrorInfo, type ReactNode } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { BlueprintCanvas } from "./BlueprintCanvas";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Blueprint render failed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell" style={{ padding: "1.5rem", color: "#f8d4d4" }}>
          <h1>Something went wrong</h1>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <div className="app-shell">
      <AppErrorBoundary>
        <ReactFlowProvider>
          <BlueprintCanvas />
        </ReactFlowProvider>
      </AppErrorBoundary>
    </div>
  );
}
