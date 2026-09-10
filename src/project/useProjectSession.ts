import { useEffect, useRef, useState } from "react";
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
import {
  markCloseProjectReactTransition,
  measureLifecyclePhase,
  startLifecycleFlow,
} from "../lifecycle/metrics";

export function useProjectSession() {
  const lastProjectStorageKey = "hisfuture.last-project";
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
  const [initializing, setInitializing] = useState(true);
  const restoreStartedRef = useRef(false);

  const run = async (operation: string, task: () => Promise<ProjectInfo | null>, onFailure?: () => void) => {
    setBusy(true);
    setError(null);
    startLifecycleFlow("project.time-to-useful-ui");
    try {
      const next = await measureLifecyclePhase(`project.${operation}.backend`, task);
      if (next) {
        setProject(next);
        localStorage.setItem(lastProjectStorageKey, next.folderPath);
        setRecentProjects((current) => {
          const nextList = [next, ...current.filter((item) => item.folderPath !== next.folderPath)].slice(0, 12);
          localStorage.setItem("hisfuture.recent-projects", JSON.stringify(nextList));
          return nextList;
        });
      }
    } catch (caught) {
      setError(asErrorMessage(caught));
      onFailure?.();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    let lastProjectPath: string | null = null;
    try {
      lastProjectPath = localStorage.getItem(lastProjectStorageKey);
    } catch {
      lastProjectPath = null;
    }

    if (!lastProjectPath) {
      setInitializing(false);
      return;
    }

    void run("restore-last", () => openProject(lastProjectPath!), () => {
      localStorage.removeItem(lastProjectStorageKey);
    }).finally(() => {
      setInitializing(false);
    });
  }, []);

  return {
    project,
    initializing,
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
    createNew: (name: string, t: Translate) => run("create", () => createProject(name, t)),
    openExisting: (t: Translate) => run("open-dialog", () => loadProject(t)),
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
    openRecent: (path: string) => run("open-recent", () => openProject(path)),
    openDirect: (path: string) => run("open-direct", () => openProject(path)),
    close: async () => {
      setBusy(true);
      setError(null);
      try {
        await measureLifecyclePhase("project.close.backend", closeProject);
        markCloseProjectReactTransition();
        localStorage.removeItem(lastProjectStorageKey);
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
