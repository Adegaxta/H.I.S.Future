import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// @hyperide-managed
if (new URLSearchParams(location.search).get("component") && location.pathname.includes("test-preview")) {
  import("./__canvas_preview__").then(m => {
    const CanvasPreviewComp = m.default;

    if (CanvasPreviewComp)
      ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<CanvasPreviewComp />);
  }).catch(err => {
    console.error("[HyperIDE] __canvas_preview__ failed to load:", err);
  });
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
