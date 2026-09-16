import "./App.css";
import "./ui/styles.css";
import HomeScreen from "./screens/HomeScreen";
import { useProjectSession } from "./project/useProjectSession";
import { lazy, Suspense, useEffect } from "react";
import { PresenceProvider, usePresence } from "./presence/PresenceProvider";
import { LocaleProvider, useLocale } from "./i18n/LocaleContext";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { APP_WINDOW_TITLE } from "./utils/appEnvironment";
import { isDesktopRuntime } from "./project/runtime";
import { AppLifecycleProvider, useAppLifecycle } from "./lifecycle/AppLifecycle";
import { invoke } from "@tauri-apps/api/core";
import progressActivityAsset from "./assets/third-party/google-material/icons/progress_activity.svg";
import type { ProjectInfo } from "./project/types";

const loadAppWorkspace = () => import("./components/AppWorkspace");
const AppWorkspace = lazy(loadAppWorkspace);

function AppLoadingScreen() {
  return (
    <div className="app-loading-screen" role="status" aria-label="Cargando H.I.S. Future">
      <img className="app-loading-screen__icon" src={progressActivityAsset} alt="" />
    </div>
  );
}

function HomeBranch({
  busy,
  error,
  recentProjects,
  onCreateProject,
  onQuickStartDev,
  onLoadProject,
  onConvertProject,
  onOpenRecent,
  onRemoveRecent,
}: {
  busy: boolean;
  error: string | null;
  recentProjects: ProjectInfo[];
  onCreateProject: (name: string, t: import("./i18n/core").Translate) => void;
  onQuickStartDev: (t: import("./i18n/core").Translate) => void;
  onLoadProject: (t: import("./i18n/core").Translate) => void;
  onConvertProject: (t: import("./i18n/core").Translate) => Promise<string | null>;
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
}) {
  const { locale } = useLocale();
  const { setPresence } = usePresence();
  useEffect(() => setPresence({ surface: "home", locale }), [locale, setPresence]);
  return <HomeScreen
    busy={busy}
    error={error}
    recentProjects={recentProjects}
    onCreateProject={onCreateProject}
    onQuickStartDev={onQuickStartDev}
    onLoadProject={onLoadProject}
    onConvertProject={onConvertProject}
    onOpenRecent={onOpenRecent}
    onRemoveRecent={onRemoveRecent}
  />;
}

function AppContent() {
  const session = useProjectSession();
  const lifecycle = useAppLifecycle();
  const archiveFailure = lifecycle.archiveSync.find((status) => status.phase === "failed");

  useEffect(() => {
    document.title = APP_WINDOW_TITLE;
    if (isDesktopRuntime()) void getCurrentWindow().setTitle(APP_WINDOW_TITLE);
  }, []);

  // Fetch the editor bundle while the native backend is opening a project.
  // A cold launch that only shows Home never pays for the workspace, graph,
  // editor and node-renderer modules.
  useEffect(() => {
    if (session.busy || session.project) void loadAppWorkspace();
  }, [session.busy, session.project]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let disposed = false;
    void invoke<string | null>("take_launch_project_path")
      .then((path) => {
        if (!disposed && path) void session.openDirect(path);
      })
      .catch((error) => {
        if (!disposed) console.error("No se pudo abrir el proyecto recibido al iniciar", error);
      });
    return () => {
      disposed = true;
    };
  }, []);

  if (session.initializing) return <AppLoadingScreen />;

  return (
    <>
    {lifecycle.exitError && (
      <div className="workspace-file-import-error app-lifecycle-error" role="alert">
        <span>{lifecycle.exitError}</span>
        <button type="button" onClick={lifecycle.dismissExitError} aria-label="Cerrar aviso">×</button>
      </div>
    )}
    {!lifecycle.exitError && archiveFailure && (
      <div className="workspace-file-import-error app-lifecycle-error" role="alert">
        <span>El estado de trabajo está seguro, pero no se pudo actualizar el archivo .his: {archiveFailure.error}</span>
      </div>
    )}
    <LocaleProvider key={session.project?.folderPath ?? "home"} projectKey={session.project?.folderPath}>
      {!session.project ? (
      <HomeBranch
        busy={session.busy}
        error={session.error}
        recentProjects={session.recentProjects}
        onCreateProject={session.createNew}
        onQuickStartDev={session.createDev}
        onLoadProject={session.openExisting}
        onConvertProject={session.convertExisting}
        onOpenRecent={session.openRecent}
        onRemoveRecent={session.removeRecent}
      />
      ) : (
      <Suspense fallback={<AppLoadingScreen />}>
        <AppWorkspace
          projectKey={session.project.folderPath}
          projectName={session.project.name}
          onExitProject={session.close}
        />
      </Suspense>
      )}
    </LocaleProvider>
    </>
  );
}

export default function App() {
  return (
    <PresenceProvider>
      <AppLifecycleProvider><AppContent /></AppLifecycleProvider>
    </PresenceProvider>
  );
}
