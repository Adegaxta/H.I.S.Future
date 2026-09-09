import AppWorkspace from "./components/AppWorkspace";
import "./App.css";
import "./ui/styles.css";
import "./workspace/panels/styles.css";
import "./workspace/navigation/styles.css";
import "./graph/styles.css";
import "./editor/styles.css";
import "./nodes/styles.css";
import HomeScreen from "./screens/HomeScreen";
import { useProjectSession } from "./project/useProjectSession";
import { useEffect } from "react";
import { clearPresence, updatePresence } from "./utils/discordPresence";
import { LocaleProvider } from "./i18n/LocaleContext";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { APP_WINDOW_TITLE } from "./utils/appEnvironment";
import { isDesktopRuntime } from "./project/runtime";
import { AppLifecycleProvider, useAppLifecycle } from "./lifecycle/AppLifecycle";

function AppContent() {
  const session = useProjectSession();
  const lifecycle = useAppLifecycle();

  useEffect(() => {
    document.title = APP_WINDOW_TITLE;
    if (isDesktopRuntime()) void getCurrentWindow().setTitle(APP_WINDOW_TITLE);
  }, []);

  useEffect(() => {
    if (!session.project) {
      clearPresence();
      return;
    }

    updatePresence("Explorando proyecto", session.project.name);

    return () => {
      clearPresence();
    };
  }, [session.project]);

  return (
    <>
    {lifecycle.exitError && (
      <div className="workspace-file-import-error app-lifecycle-error" role="alert">
        <span>{lifecycle.exitError}</span>
        <button type="button" onClick={lifecycle.dismissExitError} aria-label="Cerrar aviso">×</button>
      </div>
    )}
    <LocaleProvider key={session.project?.folderPath ?? "home"} projectKey={session.project?.folderPath}>
      {!session.project ? (
      <HomeScreen
        busy={session.busy}
        error={session.error}
        recentProjects={session.recentProjects}
        onCreateProject={session.createNew}
        onLoadProject={session.openExisting}
        onConvertProject={session.convertExisting}
        onOpenRecent={session.openRecent}
        onRemoveRecent={session.removeRecent}
      />
      ) : (
      <AppWorkspace
        projectKey={session.project.folderPath}
        projectName={session.project.name}
        onExitProject={session.close}
      />
      )}
    </LocaleProvider>
    </>
  );
}

export default function App() {
  return <AppLifecycleProvider><AppContent /></AppLifecycleProvider>;
}
