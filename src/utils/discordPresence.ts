import { invoke } from "@tauri-apps/api/core";
import type { PresenceActivity } from "../presence/types";

export async function updatePresence(activity: PresenceActivity) {
  try {
    await invoke("set_discord_presence", { activity });
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Discord Presence transport unavailable:", error);
  }
}

export async function clearPresence() {
  try {
    await invoke("clear_discord_presence");
  } catch (error) {
    if (import.meta.env.DEV) console.warn("Discord Presence cleanup unavailable:", error);
  }
}
