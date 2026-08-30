import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { asErrorMessage, isDesktopRuntime } from "./runtime";
import type { ProjectInfo } from "./types";

const DESKTOP_REQUIRED =
  "Abre HIS Future con la app de escritorio (npm run tauri dev) para crear o cargar proyectos en tu PC.";

export async function createProject(name: string): Promise<ProjectInfo | null> {
  if (!isDesktopRuntime()) throw new Error(DESKTOP_REQUIRED);
  const archivePath = await save({
    defaultPath: `${name.trim()}.his`,
    title: "Guarda el nuevo proyecto HIS Future",
    filters: [{ name: "Proyecto H.I.S. Future", extensions: ["his"] }],
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

export async function loadProject(): Promise<ProjectInfo | null> {
  if (!isDesktopRuntime()) throw new Error(DESKTOP_REQUIRED);
  const path = await open({
    multiple: false,
    directory: false,
    title: "Selecciona un proyecto H.I.S. Future",
    filters: [{ name: "Proyecto H.I.S. Future o carpeta", extensions: ["his"] }],
  });
  if (!path) return null;
  try {
    return await invoke<ProjectInfo>("open_project", { path: Array.isArray(path) ? path[0] : path });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function convertProjectFolder(): Promise<string | null> {
  if (!isDesktopRuntime()) throw new Error(DESKTOP_REQUIRED);
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Selecciona la carpeta de proyecto que quieres convertir",
  });
  if (typeof selected !== "string" || !selected) return null;

  const archivePath = await save({
    defaultPath: `${selected.split(/[\\/]/).pop() || "Proyecto"}.his`,
    title: "Guarda el proyecto convertido",
    filters: [{ name: "Proyecto H.I.S. Future", extensions: ["his"] }],
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
