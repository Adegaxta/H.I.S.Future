import AppWorkspace from "./components/AppWorkspace";
import "./App.css";
import HomeScreen from "./screens/HomeScreen";
import { useProjectSession } from "./project/useProjectSession";
import { useEffect } from "react";
import { clearPresence, updatePresence } from "./utils/discordPresence";
import { ProjectLocaleProvider } from "./i18n/LocaleContext";

export default function App() {
  const session = useProjectSession();

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

  if (!session.project) {
    return (
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
    );
  }

  return (
    <ProjectLocaleProvider key={session.project.folderPath} projectKey={session.project.folderPath}>
      <AppWorkspace
        projectKey={session.project.folderPath}
        projectName={session.project.name}
        onExitProject={session.close}
      />
    </ProjectLocaleProvider>
  );
}
