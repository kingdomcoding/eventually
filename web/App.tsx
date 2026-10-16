import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { BlueprintCanvas } from "./BlueprintCanvas";

export default function App() {
  return (
    <div className="app-shell">
      <ReactFlowProvider>
        <BlueprintCanvas />
      </ReactFlowProvider>
    </div>
  );
}
