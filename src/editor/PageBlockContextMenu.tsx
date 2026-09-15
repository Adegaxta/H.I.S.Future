import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import type { HisContextMenuItem } from "../components/HisContextMenu";
import {
  PAGE_BLOCK_CAPABILITIES,
  getPageBlockColumnCount,
  isCapabilityActive,
  type PageBlockCapabilityDefinition,
} from "./blockCapabilities";
import aestheticsIcon from "../assets/third-party/google-material/icons/keyboard_command_key8.svg";
import conversionIcon from "../assets/third-party/google-material/icons/conversion.svg";
import resetIcon from "../assets/third-party/google-material/icons/forward_media.svg";
import moveIcon from "../assets/third-party/google-material/icons/arrow_split.svg";
import copyIcon from "../assets/third-party/Lucide.dev/icons/file.svg";
import cutIcon from "../assets/third-party/Lucide.dev/icons/scissors.svg";
import pasteIcon from "../assets/third-party/Lucide.dev/icons/files.svg";
import duplicateIcon from "../assets/third-party/Lucide.dev/icons/file-stack.svg";
import aboveIcon from "../assets/third-party/Lucide.dev/icons/layers-arrow-up.svg";
import belowIcon from "../assets/third-party/Lucide.dev/icons/layers-arrow-down.svg";
import deleteIcon from "../assets/third-party/Lucide.dev/icons/layers-minus.svg";
import searchIcon from "../assets/third-party/google-material/icons/search.svg";
import textColorIcon from "../assets/third-party/google-material/icons/format_color.svg";
import fillColorIcon from "../assets/third-party/google-material/icons/format_color_fill.svg";
import borderColorIcon from "../assets/third-party/google-material/icons/border_color.svg";
import resetColorIcon from "../assets/third-party/google-material/icons/format_color_reset.svg";
import columnIcon from "../assets/third-party/google-material/icons/view_column_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import checkedIcon from "../assets/third-party/google-material/icons/check_box_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import uncheckedIcon from "../assets/third-party/google-material/icons/check_box_outline_blank_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import plusIcon from "../assets/third-party/google-material/icons/add.svg";
import minusIcon from "../assets/third-party/google-material/icons/remove.svg";
import asteriskIcon from "../assets/third-party/google-material/icons/asterisk.svg";
import { useLocale } from "../i18n/LocaleContext";
import arrowDownIcon from "../assets/third-party/google-material/icons/arrow_drop_down_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import arrowUpIcon from "../assets/third-party/google-material/icons/arrow_drop_up_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";

export type HisActionSymbol = "+" | "-" | "*" | "++" | "-+";

interface Props {
  x: number;
  y: number;
  block: HTMLElement;
  capabilityBlock?: HTMLElement;
  supportsAesthetics: boolean;
  imageItems?: HisContextMenuItem[];
  onClose: () => void;
  onCapability: (capability: PageBlockCapabilityDefinition) => void;
  onColumns: (count: number) => void;
  onResetAesthetics: () => void;
  onOpenColors: (kind: "text" | "background" | "border") => void;
  onResetColors: () => void;
  onConversion: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onInsert: (above: boolean) => void;
  onDelete: () => void;
}

const symbolAssets = { "+": [plusIcon], "-": [minusIcon], "*": [asteriskIcon], "++": [plusIcon, plusIcon], "-+": [minusIcon, plusIcon] } as const;

function Symbol({ value }: { value: HisActionSymbol }) {
  return <span className="page-context-menu__symbol" aria-hidden="true">{symbolAssets[value].map((src, index) => <img src={src} alt="" key={`${value}-${index}`} />)}</span>;
}

function useHoverSubpanel(delay = 110) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const cancel = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; };
  const enter = () => { cancel(); setOpen(true); };
  const leave = () => { cancel(); timer.current = window.setTimeout(() => setOpen(false), delay); };
  useEffect(() => cancel, []);
  return { open, enter, leave };
}

function MenuAction({ icon, label, symbol, shortcut, disabled, active, onSelect, onEnter, onLeave }: {
  icon: string; label: string; symbol?: HisActionSymbol; shortcut?: string; disabled?: boolean; active?: boolean; onSelect: () => void; onEnter?: () => void; onLeave?: () => void;
}) {
  return <button type="button" className={`page-context-menu__action${active ? " is-active" : ""}`} disabled={disabled} onClick={onSelect} onPointerEnter={onEnter} onPointerLeave={onLeave}>
    <img className="page-context-menu__action-icon" src={icon} alt="" aria-hidden="true" />
    <span>{label}</span>{symbol && <Symbol value={symbol} />}{shortcut && <kbd>{shortcut}</kbd>}
  </button>;
}

export default function PageBlockContextMenu(props: Props) {
  const { t } = useLocale();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: props.x, top: props.y });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const aesthetics = useHoverSubpanel();
  useDismissibleLayer(rootRef, props.onClose);
  useLayoutEffect(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = rect.width;
    const expandedWidth = menuWidth + 548;
    const canFitExpanded = window.innerWidth >= expandedWidth + 16;
    const maxLeft = aesthetics.open && canFitExpanded
      ? window.innerWidth - expandedWidth - 8
      : window.innerWidth - menuWidth - 8;
    setPosition({ left: Math.max(8, Math.min(props.x, maxLeft)), top: Math.max(8, Math.min(props.y, window.innerHeight - rect.height - 8)) });
  }, [props.x, props.y, aesthetics.open]);
  const select = (action: () => void, keepOpen = false) => { action(); if (!keepOpen) props.onClose(); };
  const format = PAGE_BLOCK_CAPABILITIES.filter((item) => item.group === "format");
  const properties = PAGE_BLOCK_CAPABILITIES.filter((item) => item.group === "property");
  const lists = PAGE_BLOCK_CAPABILITIES.filter((item) => item.group === "list");
  const matches = (label: string) => !searchQuery.trim() || label.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase());
  const capabilityMatches = (item: PageBlockCapabilityDefinition) => matches(t(item.labelKey));
  const visibleFormat = format.filter(capabilityMatches);
  const visibleProperties = properties.filter(capabilityMatches);
  const visibleLists = lists.filter(capabilityMatches);
  useEffect(() => {
    if (searchQuery.trim() && PAGE_BLOCK_CAPABILITIES.some(capabilityMatches)) aesthetics.enter();
  }, [searchQuery]);
  const panelOnRight = position.left + 258 + 8 + 540 + 8 <= window.innerWidth;
  const capabilityBlock = props.capabilityBlock ?? props.block;
  return <div ref={rootRef} className="page-context-menu-layer" style={position} onContextMenu={(event) => event.preventDefault()}>
    <div className="page-context-menu" role="menu">
      <div className={`page-context-menu__toolbar${searchOpen ? " is-searching" : ""}`}>
        <button className="page-context-menu__search-button" type="button" aria-label={t("editor.context.search")} onClick={() => { setSearchOpen((current) => !current); setSearchQuery(""); }}><img src={searchIcon} alt="" /></button>
        <input autoFocus={searchOpen} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label={t("editor.context.search")} />
        <div className="page-context-menu__color-tools">
          {[textColorIcon, fillColorIcon, borderColorIcon, resetColorIcon].map((icon, index) => <button key={icon} type="button" aria-label={t((["editor.context.textColor", "editor.context.backgroundColor", "editor.context.borderColor", "editor.context.resetColor"] as const)[index])} onClick={() => index === 3 ? select(props.onResetColors) : select(() => props.onOpenColors((["text", "background", "border"] as const)[index]))}><img src={icon} alt="" /></button>)}
        </div>
      </div>
      {props.supportsAesthetics && <div className="page-context-menu__section">
        {matches(t("editor.context.aesthetics")) && <MenuAction icon={aestheticsIcon} label={t("editor.context.aesthetics")} symbol="+" active={aesthetics.open} onSelect={aesthetics.enter} onEnter={aesthetics.enter} onLeave={aesthetics.leave} />}
        {matches(t("editor.context.conversion")) && <MenuAction icon={conversionIcon} label={t("editor.context.conversion")} symbol="+" onSelect={() => select(props.onConversion)} />}
        {matches(t("editor.context.resetAesthetics")) && <MenuAction icon={resetIcon} label={t("editor.context.resetAesthetics")} symbol="-" onSelect={() => select(props.onResetAesthetics)} />}
      </div>}
      <div className="page-context-menu__section">
        {props.imageItems?.filter((item) => matches(item.label)).map((item) => <MenuAction key={item.id} icon={moveIcon} label={item.label} disabled={item.disabled} onSelect={() => select(item.onSelect)} />)}
        {matches(t("editor.context.moveTo")) && <MenuAction icon={moveIcon} label={t("editor.context.moveTo")} symbol="++" disabled onSelect={() => {}} />}
      </div>
      <div className="page-context-menu__section">
        {matches(t("editor.context.copy")) && <MenuAction icon={copyIcon} label={t("editor.context.copy")} symbol="*" shortcut="Ctrl + C" onSelect={() => select(props.onCopy)} />}
        {matches(t("editor.context.cut")) && <MenuAction icon={cutIcon} label={t("editor.context.cut")} symbol="-+" shortcut="Ctrl + X" onSelect={() => select(props.onCut)} />}
        {matches(t("editor.context.paste")) && <MenuAction icon={pasteIcon} label={t("editor.context.paste")} symbol="+" shortcut="Ctrl + V" onSelect={() => select(props.onPaste)} />}
        {matches(t("editor.context.duplicate")) && <MenuAction icon={duplicateIcon} label={t("editor.context.duplicate")} symbol="++" shortcut="Ctrl + D" onSelect={() => select(props.onDuplicate)} />}
        {matches(t("editor.context.insertAbove")) && <MenuAction icon={aboveIcon} label={t("editor.context.insertAbove")} symbol="+" onSelect={() => select(() => props.onInsert(true))} />}
        {matches(t("editor.context.insertBelow")) && <MenuAction icon={belowIcon} label={t("editor.context.insertBelow")} symbol="+" onSelect={() => select(() => props.onInsert(false))} />}
        {matches(t("editor.context.delete")) && <MenuAction icon={deleteIcon} label={t("editor.context.delete")} symbol="-" shortcut={t("editor.context.deleteShortcut")} onSelect={() => select(props.onDelete)} />}
      </div>
    </div>
    {props.supportsAesthetics && aesthetics.open && <div className={`page-context-menu__aesthetics ${panelOnRight ? "is-right" : "is-left"}`} onPointerEnter={aesthetics.enter} onPointerLeave={aesthetics.leave}>
      <CapabilityColumn title={t("editor.context.format")} items={visibleFormat} block={capabilityBlock} onToggle={(item) => select(() => props.onCapability(item), true)}>
        <div className="page-context-menu__cap-divider" />
        <div className="page-context-menu__column-row"><img src={columnIcon} alt="" /><span>{t("editor.context.column")}</span><output>{getPageBlockColumnCount(capabilityBlock)}</output><span className="page-context-menu__column-stepper"><button type="button" aria-label="+" onClick={() => props.onColumns(getPageBlockColumnCount(capabilityBlock) + 1)}><img src={arrowUpIcon} alt="" /></button><button type="button" aria-label="−" onClick={() => props.onColumns(getPageBlockColumnCount(capabilityBlock) - 1)}><img src={arrowDownIcon} alt="" /></button></span></div>
      </CapabilityColumn>
      <CapabilityColumn title={t("editor.context.properties")} items={visibleProperties} block={capabilityBlock} onToggle={(item) => select(() => props.onCapability(item), true)}>
        <div className="page-context-menu__cap-divider" />
        {visibleLists.map((item) => <CapabilityRow key={item.id} item={item} block={capabilityBlock} onToggle={() => select(() => props.onCapability(item), true)} />)}
      </CapabilityColumn>
    </div>}
  </div>;
}

function CapabilityColumn({ title, items, block, onToggle, children }: { title: string; items: readonly PageBlockCapabilityDefinition[]; block: HTMLElement; onToggle: (item: PageBlockCapabilityDefinition) => void; children?: React.ReactNode }) {
  return <section><h3>{title}</h3>{items.map((item) => <CapabilityRow key={item.id} item={item} block={block} onToggle={() => onToggle(item)} />)}{children}</section>;
}

function CapabilityRow({ item, block, onToggle }: { item: PageBlockCapabilityDefinition; block: HTMLElement; onToggle: () => void }) {
  const { t } = useLocale();
  const active = isCapabilityActive(block, item);
  return <button type="button" role="menuitemcheckbox" aria-checked={active} className="page-context-menu__capability" onClick={onToggle}><img src={active ? checkedIcon : uncheckedIcon} alt="" /><img src={item.icon} alt="" /><span>{t(item.labelKey)}</span></button>;
}
