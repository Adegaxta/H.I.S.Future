import { useEffect, useRef, useState } from "react";

interface Props {
  href: string;
  text: string;
  rect: DOMRect;
  onEdit: () => void;
  onUnlink: () => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  closing?: boolean;
}

function extractHostname(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

export function LinkHoverCard({
  href,
  text,
  rect,
  onEdit,
  onUnlink,
  onClose,
  onMouseEnter,
  onMouseLeave,
  closing = false,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [internalClosing, setInternalClosing] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const isClosing = closing || internalClosing;
  const hostname = extractHostname(href);
  const displayTitle = text.trim() && text.trim() !== href ? text.trim() : hostname;

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const cardRect = card.getBoundingClientRect();
    const margin = 10;

    let top = rect.bottom + 8;
    if (top + cardRect.height > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - cardRect.height - 8);
    }

    let left = rect.left;
    if (left + cardRect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - cardRect.width - margin);
    }

    setPosition({ top, left });
  }, [rect]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard error
    }
  };

  const handleOpenLink = () => {
    const safeUrl = href.startsWith("http") || href.startsWith("mailto:") ? href : `https://${href}`;
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      ref={cardRef}
      className={`his-link-hover-card${isClosing ? " is-closing" : ""}`}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 90,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="his-link-hover-card__body" onClick={handleOpenLink} title="Abrir enlace en nueva pestaña">
        <div className="his-link-hover-card__hostname">{hostname}</div>
        <div className="his-link-hover-card__title">{displayTitle}</div>
        <div className="his-link-hover-card__url">{href}</div>
      </div>

      <div className="his-link-hover-card__actions">
        <button
          type="button"
          className="his-link-hover-card__action-btn"
          onClick={handleCopy}
        >
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </button>
        <span className="his-link-hover-card__action-sep">·</span>
        <button
          type="button"
          className="his-link-hover-card__action-btn"
          onClick={() => {
            setInternalClosing(true);
            window.setTimeout(() => {
              onEdit();
              onClose();
            }, 80);
          }}
        >
          Editar enlace
        </button>
        <span className="his-link-hover-card__action-sep">·</span>
        <button
          type="button"
          className="his-link-hover-card__action-btn his-link-hover-card__action-btn--danger"
          onClick={() => {
            setInternalClosing(true);
            window.setTimeout(() => {
              onUnlink();
              onClose();
            }, 80);
          }}
        >
          Desenlazar
        </button>
      </div>
    </div>
  );
}
