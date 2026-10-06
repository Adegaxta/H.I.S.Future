import { useState } from "react";
import coinsIcon from "../assets/third-party/Lucide.dev/icons/coins.svg";
import clockIcon from "../assets/third-party/Lucide.dev/icons/clock.svg";
import gaugeIcon from "../assets/third-party/Lucide.dev/icons/gauge.svg";
import copyIcon from "../assets/third-party/Lucide.dev/icons/copy.svg";
import editIcon from "../assets/third-party/Lucide.dev/icons/square-pen.svg";
import forkIcon from "../assets/third-party/Lucide.dev/icons/git-fork.svg";
import trashIcon from "../assets/third-party/Lucide.dev/icons/trash.svg";
import { AIModelBadge } from "./AIModelBadge";
import type { AIMessageData } from "./types";

const ACTIONS = [
  { name: "Editar", icon: editIcon },
  { name: "Bifurcar conversación", icon: forkIcon },
  { name: "Eliminar", icon: trashIcon },
] as const;

export function AIMessage({ message }: { message: AIMessageData }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className={`ai-message ai-message--${message.role}${message.error ? " is-error" : ""}${message.pending ? " is-pending" : ""}`}>
      <div className="ai-message__content">{message.content || (message.pending ? "Generando…" : "")}</div>
      {message.metrics && (
        <div className="ai-message__metrics" aria-label="Métricas experimentales">
          {message.metrics.tokens !== null && <span><img src={coinsIcon} alt="" />{message.metrics.tokens} Tokens</span>}
          {message.metrics.elapsedSeconds !== null && <span><img src={clockIcon} alt="" />{message.metrics.elapsedSeconds.toFixed(2)} s</span>}
          {message.metrics.tokensPerSecond !== null && <span><img src={gaugeIcon} alt="" />{message.metrics.tokensPerSecond.toFixed(2)} t/s</span>}
        </div>
      )}
      {message.model && <AIModelBadge model={message.model} />}
      {!message.pending && message.content && <div className="ai-message__actions">
        <button type="button" onClick={() => void copy()} title={copied ? "Copiado" : "Copiar"} aria-label={copied ? "Copiado" : "Copiar"}>
          <img src={copyIcon} alt="" />
        </button>
        {ACTIONS.map((action) => (
          <button type="button" key={action.name} title={`${action.name} (próximamente)`} aria-label={action.name} disabled>
            <img src={action.icon} alt="" />
          </button>
        ))}
      </div>}
    </article>
  );
}
