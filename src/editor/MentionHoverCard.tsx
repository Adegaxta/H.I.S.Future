import { useEffect, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { NodeIcon } from "../nodes/NodeIcon";
import { getNodeDefinition, getNodeDisplayLabel } from "../nodes/registry";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { useNodeCustomVisuals } from "../nodes/nodeIconSource";
import { getPageMeta } from "../utils/pageMeta";
import { useLocale } from "../i18n/LocaleContext";
import externalLinkIcon from "../assets/third-party/Lucide.dev/icons/arrow-right.svg";

interface Props {
  nodeId: string;
  rect: DOMRect;
  nodes: NodeItem[];
  onOpen: (id: string) => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  closing?: boolean;
}

export function MentionHoverCard({
  nodeId,
  rect,
  nodes,
  onOpen,
  onClose,
  onMouseEnter,
  onMouseLeave,
  closing = false,
}: Props) {
  const { t } = useLocale();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const targetNode = nodes.find((n) => n.id === nodeId);
  const customVisuals = useNodeCustomVisuals(nodes);
  const [internalClosing, setInternalClosing] = useState(false);

  const isClosing = closing || internalClosing;

  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

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

  if (!targetNode) return null;

  const effectiveType = getEffectiveNodeType(nodes, targetNode);
  const typeDef = getNodeDefinition(effectiveType);
  const pageMeta = getPageMeta(targetNode.content);
  const visual = customVisuals.get(targetNode.id);

  const description = pageMeta.description?.trim()
    || targetNode.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);

  return (
    <div
      ref={cardRef}
      className={`his-mention-hover-card${isClosing ? " is-closing" : ""}`}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 90,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="his-mention-hover-card__header">
        <span className="his-mention-hover-card__icon" style={{ color: typeDef.color }}>
          <NodeIcon type={effectiveType} visual={visual} />
        </span>
        <div className="his-mention-hover-card__title-group">
          <span className="his-mention-hover-card__title">{targetNode.name || "Sin título"}</span>
          <span
            className="his-mention-hover-card__type-badge"
            style={{ color: typeDef.color, borderColor: `${typeDef.color}40`, backgroundColor: `${typeDef.color}15` }}
          >
            {getNodeDisplayLabel(effectiveType, t)}
          </span>
        </div>
      </div>

      {description && (
        <p className="his-mention-hover-card__description">
          {description}
        </p>
      )}

      <div className="his-mention-hover-card__footer">
        <button
          type="button"
          className="his-mention-hover-card__open-btn"
          onClick={() => {
            setInternalClosing(true);
            window.setTimeout(() => {
              onOpen(targetNode.id);
              onClose();
            }, 120);
          }}
        >
          <span>{t("nodal.open")}</span>
          <img src={externalLinkIcon} alt="" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
