import AppWorkspace from "./components/AppWorkspace";
import "./App.css";
import HomeScreen from "./screens/HomeScreen";
import { useProjectSession } from "./project/useProjectSession";

export default function App() {
  const session = useProjectSession();

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
    <AppWorkspace
      key={session.project.folderPath}
      projectKey={session.project.folderPath}
      projectName={session.project.name}
        onExitProject={session.close}
    />
  );
}
