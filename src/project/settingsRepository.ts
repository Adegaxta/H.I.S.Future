import { invoke } from "@tauri-apps/api/core";
import { asErrorMessage } from "./runtime";
import {
  getBrowserDevSetting,
  isBrowserDevProjectActive,
  setBrowserDevSetting,
} from "./browserDevBackend";

export async function getProjectSetting(key: "locale" | "loreHiddenIds" | "deletedNodes"): Promise<string | null> {
  if (isBrowserDevProjectActive()) return getBrowserDevSetting(key);
  try {
    return await invoke<string | null>("get_project_setting", { key });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function setProjectSetting(key: "locale" | "loreHiddenIds", value: string): Promise<void> {
  if (isBrowserDevProjectActive()) {
    setBrowserDevSetting(key, value);
    return;
  }
  try {
    await invoke("set_project_setting", { key, value });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}
