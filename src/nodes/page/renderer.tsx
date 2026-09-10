import type { NodeRendererProps } from "../rendering";
import PageNodeHeader from "./header";
import { RichTextNodeContent } from "../capabilities/RichTextNodeContent";
import { getPageBlockWidthPercent, getPageMeta } from "../../utils/pageMeta";
import { createImageContent, getImageResourceInfo } from "../../utils/imageResource";
import type { UnsplashImageSelection } from "../../integrations/unsplash/types";

export function PageNodeRenderer({ node, host }: NodeRendererProps) {
  const pageMeta = getPageMeta(node.content);
  const margin = pageMeta.textPosition === "right" ? { marginLeft: "auto", marginRight: 0 } : pageMeta.textPosition === "left" ? { marginLeft: 0, marginRight: "auto" } : { marginLeft: "auto", marginRight: "auto" };
  const onUnsplashImageSelect = async (selection: UnsplashImageSelection) => {
    const existing = host.data.nodes.find((candidate) => {
      const resource = candidate.type === "imagen" ? getImageResourceInfo(candidate.content, candidate.name) : null;
      return resource?.provenance?.provider === selection.provenance.provider &&
        resource.provenance.resourceId === selection.provenance.resourceId;
    });
    if (existing) return existing.id;
    return host.mutations.createNode(
      selection.fileName,
      "imagen",
      node.parentId,
      createImageContent(selection.src, selection.fileName, null, null, selection.description, selection.provenance),
      false,
    );
  };
  return <><PageNodeHeader node={node} nodes={host.data.nodes} onContentChange={host.mutations.updateContent} onRename={host.mutations.renameNode} onImageFileUpload={async (file) => (await host.files.importFile(file, node.parentId))?.id ?? null} onUnsplashImageSelect={onUnsplashImageSelect} /><RichTextNodeContent node={node} host={host} className="page-node-editor" style={{ width: `${getPageBlockWidthPercent(pageMeta)}%`, ...margin }} /></>;
}
