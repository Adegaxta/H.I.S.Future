import { useState } from "react";
import {
  closeProject,
  createProject,
  convertProjectFolder,
  loadProject,
  openProject,
} from "../project/fileManager";
import type { ProjectInfo } from "../project/types";
import { asErrorMessage } from "../project/runtime";
import type { Translate } from "../i18n/core";

export function useProjectSession() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectInfo[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("hisfuture.recent-projects") || "[]") as ProjectInfo[];
    } catch {
      return [];
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<ProjectInfo | null>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await task();
      if (next) {
        setProject(next);
        setRecentProjects((current) => {
          const nextList = [next, ...current.filter((item) => item.folderPath !== next.folderPath)].slice(0, 12);
          localStorage.setItem("hisfuture.recent-projects", JSON.stringify(nextList));
          return nextList;
        });
      }
    } catch (caught) {
      setError(asErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return {
    project,
    busy,
    error,
    recentProjects,
    removeRecent: (path: string) => {
      setRecentProjects((current) => {
        const nextList = current.filter((item) => item.folderPath !== path);
        localStorage.setItem("hisfuture.recent-projects", JSON.stringify(nextList));
        return nextList;
      });
    },
    createNew: (name: string, t: Translate) => run(() => createProject(name, t)),
    openExisting: (t: Translate) => run(() => loadProject(t)),
    convertExisting: async (t: Translate) => {
      setBusy(true);
      setError(null);
      try {
        return await convertProjectFolder(t);
      } catch (caught) {
        setError(asErrorMessage(caught));
        return null;
      } finally {
        setBusy(false);
      }
    },
    openRecent: (path: string) => run(() => openProject(path)),
    close: async () => {
      setBusy(true);
      setError(null);
      try {
        await closeProject();
        setProject(null);
      } catch (caught) {
        setError(asErrorMessage(caught));
        throw caught;
      } finally {
        setBusy(false);
      }
    },
  };
}
