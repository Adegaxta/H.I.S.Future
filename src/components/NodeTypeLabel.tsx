import type { RenderNodeType } from "../types/nodes";
import { getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import { useLocale } from "../i18n/LocaleContext";
import { NodeIcon } from "../nodes/NodeIcon";

export default function NodeTypeLabel({ type }: { type: RenderNodeType }) {
  const { t } = useLocale();
  return <div className="editor-page__type" style={{ color: getNodeDefinition(type).color }}><NodeIcon type={type} />{getNodeDisplayLabel(type, t)}</div>;
}
