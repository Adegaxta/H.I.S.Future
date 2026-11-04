import {
  createDiagnosticEvent,
  type DiagnosticEvent,
  type DiagnosticLevel,
} from "../diagnostics/events";

const levels = new Set<DiagnosticLevel>(["ERROR", "WARN", "INFO", "DEBUG", "TRACE"]);
const actions = new Set([
  "activity.published",
  "activity.cleared",
  "connection.unavailable",
  "connection.restored",
  "connection.lost",
]);

interface DiscordDiagnosticPayload {
  level: DiagnosticLevel;
  category: "DISCORD";
  action: string;
  message: string;
  technicalDetail: string;
}

export function createDiscordDiagnosticEvent(value: unknown): DiagnosticEvent | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<DiscordDiagnosticPayload>;
  if (
    payload.category !== "DISCORD" ||
    typeof payload.level !== "string" ||
    !levels.has(payload.level as DiagnosticLevel) ||
    typeof payload.action !== "string" ||
    !actions.has(payload.action) ||
    typeof payload.message !== "string" ||
    typeof payload.technicalDetail !== "string"
  ) {
    return null;
  }
  return createDiagnosticEvent({
    level: payload.level as DiagnosticLevel,
    category: "DISCORD",
    action: payload.action,
    operation: "discord.presence",
    message: payload.message,
    technicalDetail: payload.technicalDetail,
  });
}
