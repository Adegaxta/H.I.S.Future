import { PageNodeRenderer } from "../page/renderer";
import type { NodeRendererProps } from "../rendering";

export function ProjectNodeRenderer({ node, host }: NodeRendererProps) {
  return <PageNodeRenderer node={node} host={host} type="proyecto" />;
}
