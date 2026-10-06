import { createBrowserDevProject } from "../src/project/browserDevBackend";
import { storeProjectResource } from "../src/project/resourceRepository";
import { createProjectImageContent } from "../src/utils/imageResource";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useProjectCover } from "../src/workspace/useProjectCover";
import { LocaleProvider, useLocale } from "../src/i18n/LocaleContext";
import { IconCapabilityPicker } from "../src/nodes/capabilities/IconCapabilityPicker";
import { ImagePickerDialog } from "../src/nodes/capabilities/ImagePickerDialog";
import { NodeVisualRenderer } from "../src/nodes/visuals/NodeVisualRenderer";
import type { NodeItem } from "../src/types/nodes";
import "../src/nodes/page/styles.css";

const image = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="${color}"/></svg>`)}`;
createBrowserDevProject();
const initial: NodeItem[] = [
  { id: "first", name: "Imagen de portada", type: "imagen", parentId: null, order: 0, content: `<img src="${image("red")}">` },
  { id: "second", name: "Segunda", type: "imagen", parentId: null, order: 1, content: `<img src="${image("blue")}">` },
  { id: "text", name: "Texto", type: "pagina", parentId: null, order: 2, content: "" },
];
if (location.search.includes("resource")) {
  const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>');
  await storeProjectResource("image", "cover", bytes, "svg");
  initial[0].content = createProjectImageContent({ resourceId: "cover", fileName: "cover.svg", fileSize: bytes.length, mimeType: "image/svg+xml", extension: "svg", hash: "ab".repeat(32), description: "", provenance: null });
}
function Fixture() {
  const { t } = useLocale();
  const [nodes, setNodes] = useState(initial);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"local" | "emoji" | "icon" | "unsplash">("local");
  const cover = useProjectCover({ projectKey: "vault-test", hydrated: true, nodes, createNode: () => "unused", updateContent: (id, content) => setNodes((all) => all.map((n) => n.id === id ? { ...n, content } : n)) });
  const trace = window as unknown as { sources: (string | null)[] };
  (trace.sources ??= []).push(cover.projectImage);
  return <>
    <button id="avatar" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onClick={() => setOpen(true)}>{cover.projectVisual ? <NodeVisualRenderer visual={cover.projectVisual} /> : cover.projectImage && <img src={cover.projectImage} />}</button>
    <textarea id="editor" value={nodes[2].content} onChange={(e) => setNodes((all) => all.map((n) => n.id === "text" ? { ...n, content: e.target.value } : n))} />
    <button id="metadata" onClick={() => cover.updateImageContent("first", nodes[0].content + "<p>description</p>")}>Metadata</button>
    <output id="count">{nodes.length}</output>
    {open && <ImagePickerDialog title={t("workspace.chooseVaultImage")} onClose={() => setOpen(false)}><IconCapabilityPicker nodes={nodes} tab={tab} onTabChange={setTab}
      onImageSelect={(id, presentation) => { cover.useAsCover(id, presentation); setOpen(false); }} onImageUpload={async () => null} onUnsplashSelect={async () => null}
      onEmojiSelect={(value, style) => { cover.selectVisual({ kind: "emoji", value, style }); setOpen(false); }}
      onIconSelect={(provider, name) => { cover.selectVisual({ kind: "icon", provider, name }); setOpen(false); }}
      onClear={() => { cover.clear(); setOpen(false); }} clearLabel={t("workspace.removeVaultImage")} /></ImagePickerDialog>}
  </>;
}
createRoot(document.getElementById("root")!).render(<LocaleProvider><Fixture /></LocaleProvider>);
