import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { createDiagnosticEvent, emitDiagnosticEvent } from "../diagnostics/events";

class LoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    emitDiagnosticEvent(createDiagnosticEvent({
      level: "ERROR",
      category: "SYSTEM",
      action: "workspace.render.failed",
      operation: "workspace.load",
      message: "Workspace could not render",
      technicalDetail: JSON.stringify({
        error: { name: error.name, message: error.message },
        componentStack: info.componentStack,
      }),
    }));
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function WorkspaceLoadBoundary({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return <LoadBoundary fallback={<div className="app-load-error" role="alert">
    <p>{t("workspace.loadFailed")}</p>
    <button type="button" onClick={() => window.location.reload()}>{t("workspace.reload")}</button>
  </div>}>{children}</LoadBoundary>;
}
