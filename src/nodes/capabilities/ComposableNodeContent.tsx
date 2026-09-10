import { getNodeDefinition } from "../registry";
import type { NodeRendererProps } from "../rendering";
import { RichTextNodeContent } from "./RichTextNodeContent";

export function ComposableNodeContent({ contentClassName, ...props }: NodeRendererProps & { contentClassName?: string }) {
  const capabilities = getNodeDefinition(props.node.type).composition?.capabilities ?? [];
  return <>{capabilities.map((capability) => {
    if (capability.id === "rich-text") return <RichTextNodeContent key={capability.id} {...props} className={contentClassName} />;
    return null;
  })}</>;
}
