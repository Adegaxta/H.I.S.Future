import { invoke } from "@tauri-apps/api/core";

export async function updatePresence(details: string, state: string) {
  try {
    await invoke("set_discord_presence", { details, state });
  } catch (error) {
    console.warn("Discord Rich Presence unavailable:", error);
  }
}

export async function clearPresence() {
  try {
    await invoke("clear_discord_presence");
  } catch (error) {
    console.warn("Discord Rich Presence clear failed:", error);
  }
}
