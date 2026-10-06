import { useState, type FormEvent, type KeyboardEvent } from "react";
import arrowUpIcon from "../assets/third-party/Lucide.dev/icons/arrow-up.svg";
import { AIModelBadge } from "./AIModelBadge";
import type { AIModelDescriptor } from "./types";

interface Props {
  model: AIModelDescriptor;
  isGenerating: boolean;
  onSend: (content: string) => void;
}

export function AIComposer({ model, isGenerating, onSend }: Props) {
  const [content, setContent] = useState("");
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const next = content.trim();
    if (!next || isGenerating) return;
    onSend(next);
    setContent("");
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className="ai-composer" onSubmit={submit}>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Escribe un mensaje..."
        aria-label="Mensaje"
      />
      <AIModelBadge model={model} />
      <button type="submit" className="ai-composer__send" disabled={!content.trim() || isGenerating} title="Enviar" aria-label="Enviar mensaje">
        <img src={arrowUpIcon} alt="" />
      </button>
    </form>
  );
}
