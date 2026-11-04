import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isDesktopRuntime } from "../project/runtime";
import { measureLifecyclePhase } from "./metrics";
import { createDiagnosticEvent, emitDiagnosticEvent } from "../diagnostics/events";

type FlushWorkspace = () => Promise<void>;

interface ArchiveSyncStatus {
  archivePath: string;
  phase: "pending" | "syncing" | "clean" | "failed";
  error?: string | null;
}

interface AppLifecycleValue {
  hideApplication: () => Promise<void>;
  registerWorkspaceFlush: (flush: FlushWorkspace) => () => void;
  exitApplication: () => Promise<void>;
  exitError: string | null;
  dismissExitError: () => void;
  archiveSync: ArchiveSyncStatus[];
}

const AppLifecycleContext = createContext<AppLifecycleValue | null>(null);

export function AppLifecycleProvider({ children }: { children: ReactNode }) {
  const flushRef = useRef<FlushWorkspace | null>(null);
  const exitingRef = useRef(false);
  const emittedArchiveStatusesRef = useRef(new Map<string, string>());
  const [exitError, setExitError] = useState<string | null>(null);
  const [archiveSync, setArchiveSync] = useState<ArchiveSyncStatus[]>([]);

  const showApplication = useCallback(async () => {
    if (!isDesktopRuntime()) return;
    await measureLifecyclePhase("window.restore", async () => {
      const window = getCurrentWindow();
      await window.show();
      await window.unminimize();
      await window.setFocus();
    });
  }, []);

  const hideApplication = useCallback(async () => {
    if (!isDesktopRuntime()) return;
    await measureLifecyclePhase("window.hide", () => getCurrentWindow().hide());
  }, []);

  const exitApplication = useCallback(async () => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExitError(null);
    try {
      await hideApplication();
      await flushRef.current?.();
      await invoke("exit_application");
    } catch (error) {
      const message = `No se pudo salir con seguridad: ${String(error)}`;
      setExitError(message);
      emitDiagnosticEvent(createDiagnosticEvent({
        level: "ERROR",
        category: "SYSTEM",
        action: "application.exit.failed",
        operation: "application.exit",
        message: "Could not exit safely",
        technicalDetail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }));
      try {
        await showApplication();
      } catch (showError) {
        emitDiagnosticEvent(createDiagnosticEvent({
          level: "ERROR",
          category: "SYSTEM",
          action: "application.window-restore.failed",
          operation: "application.exit",
          message: "Could not restore the application window after exit failed",
          technicalDetail: showError instanceof Error ? `${showError.name}: ${showError.message}` : String(showError),
        }));
      }
    } finally {
      exitingRef.current = false;
    }
  }, [hideApplication, showApplication]);

  const exitApplicationRef = useRef(exitApplication);
  exitApplicationRef.current = exitApplication;

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let disposed = false;
    let stopExit: (() => void) | undefined;
    let stopClose: (() => void) | undefined;

    void listen("app-exit-requested", () => void exitApplicationRef.current()).then((stop) => {
      if (disposed) stop();
      else stopExit = stop;
    });
    void getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      void hideApplication();
    }).then((stop) => {
      if (disposed) stop();
      else stopClose = stop;
    });

    return () => {
      disposed = true;
      stopExit?.();
      stopClose?.();
    };
  }, [hideApplication]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let disposed = false;
    let stopStatus: (() => void) | undefined;
    const update = (status: ArchiveSyncStatus) => {
      const signature = JSON.stringify({ phase: status.phase, error: status.error ?? null });
      const emitted = emittedArchiveStatusesRef.current;
      if (emitted.get(status.archivePath) !== signature) {
        emitted.set(status.archivePath, signature);
        const level = status.phase === "failed" ? "ERROR" : "INFO";
        emitDiagnosticEvent(createDiagnosticEvent({
          level,
          category: "PROJECT",
          action: `archive.sync.${status.phase}`,
          operation: "archive.sync",
          message: status.phase === "failed" ? "Project archive sync failed" : `Project archive ${status.phase}`,
          technicalDetail: JSON.stringify({
            phase: status.phase,
            ...(status.error ? { error: status.error } : {}),
          }),
        }));
      }
      setArchiveSync((current) => [
        status,
        ...current.filter((item) => item.archivePath !== status.archivePath),
      ]);
    };
    void invoke<ArchiveSyncStatus[]>("archive_sync_status").then((statuses) => {
      if (!disposed) statuses.forEach(update);
    }).catch((error) => emitDiagnosticEvent(createDiagnosticEvent({
      level: "ERROR",
      category: "PROJECT",
      action: "archive.sync.status-read.failed",
      operation: "archive.sync",
      message: "Could not read project archive sync status",
      technicalDetail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    })));
    void listen<ArchiveSyncStatus>("archive-sync-status", (event) => update(event.payload)).then((stop) => {
      if (disposed) stop();
      else stopStatus = stop;
    });
    return () => {
      disposed = true;
      stopStatus?.();
    };
  }, []);

  const value = useMemo<AppLifecycleValue>(() => ({
    hideApplication,
    exitApplication,
    exitError,
    archiveSync,
    dismissExitError: () => setExitError(null),
    registerWorkspaceFlush: (flush) => {
      flushRef.current = flush;
      return () => {
        if (flushRef.current === flush) flushRef.current = null;
      };
    },
  }), [archiveSync, exitApplication, exitError, hideApplication]);

  return <AppLifecycleContext.Provider value={value}>{children}</AppLifecycleContext.Provider>;
}

export function useAppLifecycle(): AppLifecycleValue {
  const value = useContext(AppLifecycleContext);
  if (!value) throw new Error("useAppLifecycle requiere AppLifecycleProvider.");
  return value;
}
