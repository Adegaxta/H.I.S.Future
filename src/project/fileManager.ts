import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { asErrorMessage, isDesktopRuntime } from "./runtime";
import type { ProjectInfo } from "./types";
import type { Translate } from "../i18n/core";

export async function createProject(name: string, t: Translate): Promise<ProjectInfo | null> {
  if (!isDesktopRuntime()) throw new Error(t("home.desktopRequired"));
  const archivePath = await save({
    defaultPath: `${name.trim()}.his`,
    title: t("home.dialog.saveNew"),
    filters: [{ name: t("home.dialog.projectFilter"), extensions: ["his"] }],
  });
  if (!archivePath) return null;
  try {
    return await invoke<ProjectInfo>("create_project_file", {
      archivePath,
      name: name.trim(),
    });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function loadProject(t: Translate): Promise<ProjectInfo | null> {
  if (!isDesktopRuntime()) throw new Error(t("home.desktopRequired"));
  const path = await open({
    multiple: false,
    directory: false,
    title: t("home.dialog.open"),
    filters: [{ name: t("home.dialog.openFilter"), extensions: ["his"] }],
  });
  if (!path) return null;
  try {
    return await invoke<ProjectInfo>("open_project", { path: Array.isArray(path) ? path[0] : path });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function convertProjectFolder(t: Translate): Promise<string | null> {
  if (!isDesktopRuntime()) throw new Error(t("home.desktopRequired"));
  const selected = await open({
    directory: true,
    multiple: false,
    title: t("home.dialog.convertSource"),
  });
  if (typeof selected !== "string" || !selected) return null;

  const archivePath = await save({
    defaultPath: `${selected.split(/[\\/]/).pop() || t("home.dialog.defaultProjectName")}.his`,
    title: t("home.dialog.convertSave"),
    filters: [{ name: t("home.dialog.projectFilter"), extensions: ["his"] }],
  });
  if (!archivePath) return null;
  try {
    return await invoke<string>("convert_project_folder", {
      sourceFolder: selected,
      archivePath,
    });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function openProject(path: string): Promise<ProjectInfo> {
  try {
    return await invoke<ProjectInfo>("open_project", { path });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function closeProject(): Promise<void> {
  if (!isDesktopRuntime()) return;
  try {
    await invoke("close_project");
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}
