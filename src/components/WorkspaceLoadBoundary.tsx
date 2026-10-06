import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocale } from "../i18n/LocaleContext";

class LoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Workspace could not render", error, info.componentStack);
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
