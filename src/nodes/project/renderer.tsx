import NodeTypeLabel from "../../components/NodeTypeLabel";
import { useLocale } from "../../i18n/LocaleContext";
import { ComposableNodeContent } from "../capabilities/ComposableNodeContent";
import type { NodeRendererProps } from "../rendering";
import { NodeNameInput } from "../viewPrimitives";
import { isVaultPrimaryNode } from "./domain";

export function ProjectNodeRenderer({ node, host }: NodeRendererProps) {
  const { t } = useLocale();
  const primary = isVaultPrimaryNode(node);
  return <>
    <header className="project-node-header">
      <div className="project-node-header__type"><NodeTypeLabel type={node.type} />{primary && <span className="project-node-header__primary">★ {t("project.primary")}</span>}</div>
      <NodeNameInput node={node} onRename={host.mutations.renameNode} className="editor-page__title project-node-header__title" placeholder={t("nodes.project.nodeName")} />
    </header>
    <ComposableNodeContent node={node} host={host} contentClassName="page-node-editor project-node-editor" />
  </>;
}
