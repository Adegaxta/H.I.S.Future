export type PageBlockCapabilityGroup = "format" | "property" | "list";
import type { TranslationKey } from "../i18n/translations";

export interface PageBlockCapabilityDefinition {
  id: string;
  labelKey: TranslationKey;
  group: PageBlockCapabilityGroup;
  icon: string;
  attribute?: string;
  value?: string;
  tagName?: `H${1 | 2 | 3 | 4 | 5 | 6}`;
  exclusiveGroup?: "heading" | "list";
}

import heading1 from "../assets/third-party/Lucide.dev/icons/heading-1.svg";
import heading2 from "../assets/third-party/Lucide.dev/icons/heading-2.svg";
import heading3 from "../assets/third-party/Lucide.dev/icons/heading-3.svg";
import heading4 from "../assets/third-party/Lucide.dev/icons/heading-4.svg";
import heading5 from "../assets/third-party/Lucide.dev/icons/heading-5.svg";
import heading6 from "../assets/third-party/Lucide.dev/icons/heading-6.svg";
import dropdown from "../assets/third-party/Lucide.dev/icons/chevron-down.svg";
import globe from "../assets/third-party/Lucide.dev/icons/square-text.svg";
import highlighted from "../assets/third-party/google-material/icons/format_letter_spacing_wider_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import code from "../assets/third-party/google-material/icons/code_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import equation from "../assets/third-party/google-material/icons/functions_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import synced from "../assets/third-party/google-material/icons/sync_256dp_E3E3E3_FILL0_wght400_GRAD0_opsz48.svg";
import bullets from "../assets/third-party/Lucide.dev/icons/list.svg";
import collapsibleList from "../assets/third-party/Lucide.dev/icons/list-collapse.svg";
import numbered from "../assets/third-party/Lucide.dev/icons/list-ordered.svg";
import tree from "../assets/third-party/Lucide.dev/icons/list-tree.svg";
import todo from "../assets/third-party/Lucide.dev/icons/list-todo.svg";

export const PAGE_TEXT_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, blockquote, li, pre";

export const PAGE_BLOCK_CAPABILITIES: readonly PageBlockCapabilityDefinition[] = [
  ...([heading1, heading2, heading3, heading4, heading5, heading6] as const).map((icon, index) => ({
    id: `heading-${index + 1}`,
    labelKey: `editor.context.heading${index + 1}` as TranslationKey,
    group: "format" as const,
    icon,
    tagName: `H${index + 1}` as PageBlockCapabilityDefinition["tagName"],
    exclusiveGroup: "heading" as const,
  })),
  { id: "dropdown", labelKey: "editor.context.dropdown", group: "property", icon: dropdown, attribute: "data-his-dropdown" },
  { id: "globe", labelKey: "editor.context.globe", group: "property", icon: globe, attribute: "data-globe" },
  { id: "highlighted", labelKey: "editor.context.highlighted", group: "property", icon: highlighted, attribute: "data-his-highlighted" },
  { id: "code", labelKey: "editor.context.code", group: "property", icon: code, attribute: "data-his-code" },
  { id: "equation", labelKey: "editor.context.equation", group: "property", icon: equation, attribute: "data-his-equation" },
  { id: "synced", labelKey: "editor.context.synced", group: "property", icon: synced, attribute: "data-his-synced" },
  { id: "bullets", labelKey: "editor.context.bullets", group: "list", icon: bullets, attribute: "data-his-list", value: "bullets", exclusiveGroup: "list" },
  { id: "collapsible-list", labelKey: "editor.context.collapsibleList", group: "list", icon: collapsibleList, attribute: "data-his-list", value: "collapsible", exclusiveGroup: "list" },
  { id: "numbered", labelKey: "editor.context.numbered", group: "list", icon: numbered, attribute: "data-his-list", value: "numbered", exclusiveGroup: "list" },
  { id: "tree", labelKey: "editor.context.tree", group: "list", icon: tree, attribute: "data-his-list", value: "tree", exclusiveGroup: "list" },
  { id: "todo", labelKey: "editor.context.todo", group: "list", icon: todo, attribute: "data-his-list", value: "todo", exclusiveGroup: "list" },
] as const;

export const PAGE_BLOCK_COMPATIBILITY = {
  heading: { exclusive: true },
  list: { exclusive: true },
  properties: { composable: true },
} as const;

export function isPageTextBlock(block: Element | null): block is HTMLElement {
  return block instanceof HTMLElement && block.matches(PAGE_TEXT_BLOCK_SELECTOR);
}

export function isCapabilityActive(block: HTMLElement, capability: PageBlockCapabilityDefinition): boolean {
  if (capability.tagName) return block.tagName === capability.tagName;
  if (!capability.attribute) return false;
  if (capability.id === "globe") return block.matches("[data-globe]") || Boolean(block.closest("[data-globe]"));
  // Anytype serializes a code block as PRE while H.I.S. Future stores Code as
  // a composable capability. Both representations are the same active state.
  if (capability.id === "code") return block.tagName === "PRE" || block.hasAttribute(capability.attribute);
  if (capability.id === "synced") return block.hasAttribute(capability.attribute);
  return block.getAttribute(capability.attribute) === (capability.value ?? "true");
}

function replaceBlockTag(block: HTMLElement, tagName: string): HTMLElement {
  if (block.tagName === tagName) return block;
  const replacement = document.createElement(tagName);
  Array.from(block.attributes).forEach(({ name, value }) => replacement.setAttribute(name, value));
  while (block.firstChild) replacement.appendChild(block.firstChild);
  block.replaceWith(replacement);
  return replacement;
}

function unwrapDirectCode(block: HTMLElement): void {
  const code = block.querySelector<HTMLElement>(":scope > code");
  if (code) code.replaceWith(...Array.from(code.childNodes));
}

export function togglePageBlockCapability(
  block: HTMLElement,
  capability: PageBlockCapabilityDefinition,
): HTMLElement {
  if (capability.tagName) {
    return replaceBlockTag(block, isCapabilityActive(block, capability) ? "P" : capability.tagName);
  }
  if (!capability.attribute) return block;
  if (capability.id === "globe") return block;
  const active = isCapabilityActive(block, capability);
  if (capability.id === "code" && block.tagName === "PRE") {
    const replacement = replaceBlockTag(block, "P");
    replacement.removeAttribute(capability.attribute);
    unwrapDirectCode(replacement);
    return replacement;
  } else if (capability.id === "dropdown") {
    if (active) {
      block.removeAttribute(capability.attribute);
      block.removeAttribute("data-his-collapsed");
      const content = block.querySelector<HTMLElement>(":scope > [data-his-dropdown-content]");
      if (content) content.replaceWith(...Array.from(content.childNodes));
    } else {
      block.setAttribute(capability.attribute, "true");
      const content = document.createElement("span");
      content.dataset.hisDropdownContent = "true";
      while (block.firstChild) content.appendChild(block.firstChild);
      block.appendChild(content);
    }
  } else if (capability.id === "synced") {
    if (active) block.removeAttribute(capability.attribute);
    else block.setAttribute(capability.attribute, crypto.randomUUID());
  } else if (active) block.removeAttribute(capability.attribute);
  else block.setAttribute(capability.attribute, capability.value ?? "true");
  return block;
}

export function getPageBlockColumnCount(block: HTMLElement): number {
  const layout = block.closest<HTMLElement>("[data-his-column-layout]");
  if (!layout) return 1;
  return Math.min(4, Math.max(1, layout.querySelectorAll(":scope > [data-his-column]").length));
}

export function setPageBlockColumnCount(block: HTMLElement, count: number): void {
  const safe = Math.min(4, Math.max(1, Math.round(count)));
  let layout = block.closest<HTMLElement>("[data-his-column-layout]");
  if (!layout && safe === 1) return;
  if (!layout) {
    layout = document.createElement("div");
    layout.dataset.hisColumnLayout = "true";
    const firstColumn = document.createElement("div");
    firstColumn.dataset.hisColumn = "true";
    firstColumn.contentEditable = "false";
    block.replaceWith(layout);
    layout.appendChild(firstColumn);
    block.contentEditable = "true";
    firstColumn.appendChild(block);
  }
  const columns = Array.from(layout.querySelectorAll<HTMLElement>(":scope > [data-his-column]"));
  if (safe === 1) {
    const parent = layout.parentNode;
    if (!parent) return;
    columns.flatMap((column) => Array.from(column.childNodes)).forEach((child) => parent.insertBefore(child, layout!));
    layout.remove();
    return;
  }
  while (columns.length < safe) {
    const column = document.createElement("div");
    column.dataset.hisColumn = "true";
    column.contentEditable = "false";
    const line = document.createElement("p");
    line.contentEditable = "true";
    line.appendChild(document.createElement("br"));
    column.appendChild(line);
    layout.appendChild(column);
    columns.push(column);
  }
  while (columns.length > safe) {
    const removed = columns.pop()!;
    const destination = columns[columns.length - 1];
    Array.from(removed.childNodes).forEach((child) => destination.appendChild(child));
    removed.remove();
  }
}

export function resetPageBlockAesthetics(block: HTMLElement): HTMLElement {
  let target = /^(?:H[1-6]|PRE)$/.test(block.tagName) ? replaceBlockTag(block, "P") : block;
  unwrapDirectCode(target);
  const dropdown = PAGE_BLOCK_CAPABILITIES.find((capability) => capability.id === "dropdown");
  if (dropdown && isCapabilityActive(target, dropdown)) target = togglePageBlockCapability(target, dropdown);
  PAGE_BLOCK_CAPABILITIES.forEach((capability) => {
    if (capability.attribute) target.removeAttribute(capability.attribute);
  });
  delete target.dataset.hisCollapsed;
  delete target.dataset.hisTodoChecked;
  target.style.removeProperty("color");
  target.style.removeProperty("background-color");
  target.style.removeProperty("border-color");
  if (!target.getAttribute("style")) target.removeAttribute("style");
  return target;
}
