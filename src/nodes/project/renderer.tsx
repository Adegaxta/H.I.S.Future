import NodeTypeLabel from "../../components/NodeTypeLabel";
import { useLocale } from "../../i18n/LocaleContext";
import { ComposableNodeContent } from "../capabilities/ComposableNodeContent";
import type { NodeRendererProps } from "../rendering";
import { NodeNameInput } from "../viewPrimitives";

export function ProjectNodeRenderer({ node, host }: NodeRendererProps) {
  const { t } = useLocale();
  return <>
    <header className="project-node-header">
      <div className="project-node-header__type"><NodeTypeLabel type={node.type} node={node} /></div>
      <NodeNameInput node={node} onRename={host.mutations.renameNode} className="editor-page__title project-node-header__title-input" placeholder={t("nodes.project.nodeName")} />
    </header>
    <ComposableNodeContent node={node} host={host} contentClassName="page-node-editor project-node-editor" />
  </>;
}
