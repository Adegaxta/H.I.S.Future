import type { RenderNodeType } from "../types/nodes";
import { getNodeDefinition, getNodeDisplayLabel } from "../defs/nodeTypes";
import { useLocale } from "../i18n/LocaleContext";
import { NodeIcon } from "../nodes/NodeIcon";
import { isVaultPrimaryNode } from "../nodes/project/domain";
import starIcon from "../assets/third-party/google-material/icons/star.svg";
import type { ResolvedNodeVisual } from "../nodes/visuals/types";

export default function NodeTypeLabel({ type, node, iconSource, visual }: { type: RenderNodeType; node?: { content: string }; iconSource?: string; visual?: ResolvedNodeVisual }) {
  const { t } = useLocale();
  return <div className="editor-page__type" style={{ color: getNodeDefinition(type).color }}><NodeIcon type={type} source={iconSource} visual={visual} />{node && isVaultPrimaryNode(node) && <img className="primary-node-badge" src={starIcon} alt="" aria-hidden="true" />}{getNodeDisplayLabel(type, t)}</div>;
}
