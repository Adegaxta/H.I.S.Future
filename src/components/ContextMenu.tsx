import type { ContextMenuState } from "../types/nodes";
import HisContextMenu, { type HisContextMenuItem } from "./HisContextMenu";
import { useLocale } from "../i18n/LocaleContext";
import type { Translate } from "../i18n/LocaleContext";

interface ContextMenuProps {
  menu: ContextMenuState;
  onCreate?: (parentId: string | null) => void;
  onRename: (nodeId: string) => void;
  onView: (nodeId: string) => void;
  onRemoveFromLore: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  removeCount?: number;
  canDelete?: boolean;
}

type ContextMenuActions = Omit<ContextMenuProps, "onClose"> & { t: Translate };

export function buildNodeContextMenuItems({
  menu,
  onCreate,
  onRename,
  onView,
  onRemoveFromLore,
  onDelete,
  removeCount = 1,
  canDelete = true,
  t,
}: ContextMenuActions): HisContextMenuItem[] {
  const items: HisContextMenuItem[] = [];
  if (menu.context === "lore" && onCreate) items.push({
    id: "create",
    label: t(menu.nodeId ? "context.createInside" : "context.createRoot"),
    onSelect: () => onCreate(menu.nodeId),
  });
  if (menu.nodeId) {
    const id = menu.nodeId;
    items.push({ id: "rename", label: t("context.rename"), onSelect: () => onRename(id) });
    items.push({ id: "view", label: t("context.view"), onSelect: () => onView(id) });
    if (menu.context === "lore") {
      items.push({ id: "remove-lore", label: t(removeCount > 1 ? "context.removeManyFromLore" : "context.removeFromLore", { count: removeCount }), onSelect: () => onRemoveFromLore(id) });
      if (menu.extended) items.push({ id: "delete", label: t("context.deleteNode"), danger: true, disabled: !canDelete, onSelect: () => onDelete(id) });
    } else {
      items.push({ id: "delete", label: t("context.deleteNode"), danger: true, disabled: !canDelete, onSelect: () => onDelete(id) });
    }
  }
  return items;
}

export default function ContextMenu(props: ContextMenuProps) {
  const { t } = useLocale();
  const items = buildNodeContextMenuItems({ ...props, t });
  return <HisContextMenu x={props.menu.x} y={props.menu.y} items={items} onClose={props.onClose} />;
}
