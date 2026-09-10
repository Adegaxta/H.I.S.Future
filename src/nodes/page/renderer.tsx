import type { NodeRendererProps } from "../rendering";
import PageNodeHeader from "./header";
import { RichTextNodeContent } from "../capabilities/RichTextNodeContent";
import { getPageBlockWidthPercent, getPageMeta } from "../../utils/pageMeta";

export function PageNodeRenderer({ node, host }: NodeRendererProps) {
  const pageMeta = getPageMeta(node.content);
  const margin = pageMeta.textPosition === "right" ? { marginLeft: "auto", marginRight: 0 } : pageMeta.textPosition === "left" ? { marginLeft: 0, marginRight: "auto" } : { marginLeft: "auto", marginRight: "auto" };
  return <><PageNodeHeader node={node} nodes={host.data.nodes} onContentChange={host.mutations.updateContent} onRename={host.mutations.renameNode} onImageFileUpload={async (file) => (await host.files.importFile(file, node.parentId))?.id ?? null} /><RichTextNodeContent node={node} host={host} className="page-node-editor" style={{ width: `${getPageBlockWidthPercent(pageMeta)}%`, ...margin }} /></>;
}
