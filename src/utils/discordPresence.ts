import { invoke } from "@tauri-apps/api/core";
import type { PresenceActivity } from "../presence/types";
import { createDiagnosticEvent, emitDiagnosticEvent } from "../diagnostics/events";

export async function updatePresence(activity: PresenceActivity) {
  try {
    await invoke("set_discord_presence", { activity });
  } catch (error) {
    emitDiagnosticEvent(createDiagnosticEvent({
      level: "ERROR",
      category: "DISCORD",
      action: "presence.update.failed",
      operation: "discord.presence",
      message: "Could not submit Discord activity to the native runtime",
      technicalDetail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }));
    if (import.meta.env.DEV) console.warn("Discord Presence transport unavailable:", error);
  }
}

export async function clearPresence() {
  try {
    await invoke("clear_discord_presence");
  } catch (error) {
    emitDiagnosticEvent(createDiagnosticEvent({
      level: "ERROR",
      category: "DISCORD",
      action: "presence.clear.failed",
      operation: "discord.presence",
      message: "Could not clear Discord activity in the native runtime",
      technicalDetail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }));
    if (import.meta.env.DEV) console.warn("Discord Presence cleanup unavailable:", error);
  }
}
