import AppWorkspace from "./components/AppWorkspace";
import "./App.css";
import "./nodes/styles.css";
import HomeScreen from "./screens/HomeScreen";
import { useProjectSession } from "./project/useProjectSession";
import { useEffect } from "react";
import { clearPresence, updatePresence } from "./utils/discordPresence";
import { LocaleProvider } from "./i18n/LocaleContext";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { APP_WINDOW_TITLE } from "./utils/appEnvironment";
import { isDesktopRuntime } from "./project/runtime";

export default function App() {
  const session = useProjectSession();

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
  );
}
