import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NodeItem } from "../types/nodes";
import { useLocale } from "../i18n/LocaleContext";
import { NodeIcon } from "../nodes/NodeIcon";
import { getEffectiveNodeType } from "../utils/nodeTree";
import { normalizeSearchText } from "../utils/searchText";

interface QuickSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  nodes: NodeItem[];
  recentNodes?: NodeItem[];
}

export function QuickSwitcherModal({
  isOpen,
  onClose,
  onSelectNode,
  nodes,
  recentNodes = [],
}: QuickSwitcherModalProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Filter candidate nodes
  const filteredNodes = useMemo(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      if (recentNodes.length > 0) {
        return recentNodes.slice(0, 10);
      }
      return nodes.slice(0, 10);
    }

    const normQuery = normalizeSearchText(trimmed);
    return nodes
      .filter((n) => {
        const normName = normalizeSearchText(n.name || "");
        const normType = normalizeSearchText(n.type || "");
        return normName.includes(normQuery) || normType.includes(normQuery);
      })
      .slice(0, 20);
  }, [nodes, recentNodes, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keep selected item in view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (filteredNodes.length > 0 ? (prev + 1) % filteredNodes.length : 0));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (filteredNodes.length > 0 ? (prev - 1 + filteredNodes.length) % filteredNodes.length : 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const target = filteredNodes[selectedIndex];
      if (target) {
        onSelectNode(target.id);
        onClose();
      }
    }
  };

  const isRecentList = !query.trim() && recentNodes.length > 0;

  return createPortal(
    <div
      className="quick-switcher-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t("editor.quickSwitcher.placeholder")}
    >
      <div className="quick-switcher-card" onKeyDown={handleKeyDown}>
        <div className="quick-switcher-input-wrap">
          <svg
            className="quick-switcher-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="quick-switcher-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("editor.quickSwitcher.placeholder")}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="quick-switcher-esc" onClick={onClose}>
            ESC
          </kbd>
        </div>

        {isRecentList && (
          <div className="quick-switcher-section-title">
            {t("editor.quickSwitcher.recent")}
          </div>
        )}

        <div className="quick-switcher-list" ref={listRef}>
          {filteredNodes.length === 0 ? (
            <div className="quick-switcher-empty">
              {t("editor.quickSwitcher.noResults")}
            </div>
          ) : (
            filteredNodes.map((item, index) => {
              const isSelected = index === selectedIndex;
              const effectiveType = getEffectiveNodeType(nodes, item);
              return (
                <div
                  key={item.id}
                  className={`quick-switcher-item ${isSelected ? "is-selected" : ""}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    onSelectNode(item.id);
                    onClose();
                  }}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="quick-switcher-item-icon">
                    <NodeIcon type={effectiveType} />
                  </span>
                  <span className="quick-switcher-item-name">
                    {item.name || "Sin título"}
                  </span>
                  <span className="quick-switcher-item-type">
                    {item.type}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="quick-switcher-footer">
          <span>{t("editor.quickSwitcher.hint")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
