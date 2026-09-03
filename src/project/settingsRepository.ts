import { invoke } from "@tauri-apps/api/core";
import { asErrorMessage } from "./runtime";

export async function getProjectSetting(key: "locale"): Promise<string | null> {
  try {
    return await invoke<string | null>("get_project_setting", { key });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}

export async function setProjectSetting(key: "locale", value: string): Promise<void> {
  try {
    await invoke("set_project_setting", { key, value });
  } catch (error) {
    throw new Error(asErrorMessage(error));
  }
}
