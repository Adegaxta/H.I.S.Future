import { useState } from "react";
import { createRoot } from "react-dom/client";
import PageNodeHeader from "../src/nodes/page/header";
import { IconCapabilityPicker } from "../src/nodes/capabilities/IconCapabilityPicker";
import { ImagePickerDialog } from "../src/nodes/capabilities/ImagePickerDialog";
import { PresentedImage } from "../src/nodes/visuals/PresentedImage";
import { NodeVisualRenderer } from "../src/nodes/visuals/NodeVisualRenderer";
import { useProjectCover } from "../src/workspace/useProjectCover";
import { createBrowserDevProject, getBrowserDevSetting } from "../src/project/browserDevBackend";
import { createProjectImageContent } from "../src/utils/imageResource";
import { storeProjectResource, readProjectResource } from "../src/project/resourceRepository";
import { LocaleProvider } from "../src/i18n/LocaleContext";
import { getPageMeta } from "../src/utils/pageMeta";
import type { NodeItem } from "../src/types/nodes";
import "../src/App.css";
import "../src/nodes/page/styles.css";

createBrowserDevProject();
const originalBytes = new Map<string, Uint8Array>();
const images: NodeItem[] = [];
async function addOriginal(id: string, width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  for (let i = 0; i < 3; i++) { ctx.fillStyle = ["#ff0000", "#00ff00", "#0000ff"][i]; ctx.fillRect(i * width / 3, 0, width / 3, height); }
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  const bytes = new Uint8Array(await blob.arrayBuffer()); originalBytes.set(id, bytes);
  await storeProjectResource("image", id, bytes, "png");
  images.push({ id, name: id, type: "imagen", parentId: null, order: images.length, content: createProjectImageContent({ resourceId: id, fileName: `${id}.png`, fileSize: bytes.length, mimeType: "image/png", extension: "png", hash: "ab".repeat(32), description: "", provenance: null }) });
}
await addOriginal("wide", 1920, 1080); await addOriginal("tall", 1080, 1920);
function Fixture() {
  const [nodes, setNodes] = useState<NodeItem[]>(() => JSON.parse(localStorage.getItem("framing-nodes") || "null") ?? [...images, { id: "page", name: "Page", type: "pagina", parentId: null, order: 2, content: "<p>Keep this text</p>" }]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"local" | "emoji" | "icon" | "unsplash">("local");
  const [editCurrent, setEditCurrent] = useState(false);
  const update = (id: string, content: string) => setNodes((all) => { const next = all.map((n) => n.id === id ? { ...n, content } : n); localStorage.setItem("framing-nodes", JSON.stringify(next)); return next; });
  const vault = useProjectCover({ projectKey: "framing-test", hydrated: true, nodes, createNode: () => "unused", updateContent: update });
  const upload = async (file: File) => {
    const id = "uploaded"; const bytes = new Uint8Array(await file.arrayBuffer()); originalBytes.set(id, bytes);
    await storeProjectResource("image", id, bytes, "png");
    setNodes((all) => [...all, { id, name: file.name, type: "imagen", parentId: null, order: all.length, content: createProjectImageContent({ resourceId: id, fileName: file.name, fileSize: bytes.length, mimeType: "image/png", extension: "png", hash: "cd".repeat(32), description: "", provenance: null }) }]);
    return id;
  };
  const trace = window as unknown as Record<string, any>;
  trace.parentRenders = (trace.parentRenders || 0) + 1;
  trace.state = { nodes, vaultPresentation: vault.projectPresentation, vaultImageId: vault.projectImageNodeId, pageMeta: getPageMeta(nodes.find((n) => n.id === "page")!.content) };
  trace.savedVault = () => getBrowserDevSetting("vaultImage");
  trace.originalUnchanged = async () => { for (const [id, bytes] of originalBytes) { const saved = await readProjectResource("image", id, "png"); if (saved.length !== bytes.length || saved.some((b, i) => b !== bytes[i])) return false; } return true; };
  return <>
    <button id="vault" style={{ width: 60, height: 60, padding: 0 }} onClick={() => { setEditCurrent(true); setOpen(true); }}>{vault.projectVisual ? <NodeVisualRenderer visual={vault.projectVisual} /> : vault.projectImage && <PresentedImage src={vault.projectImage} presentation={vault.projectPresentation ?? { centerX: .5, centerY: .5, zoom: 1 }} className="fixture-vault-image" />}</button>
    <button id="pick-vault" onClick={() => { setEditCurrent(false); setOpen(true); }}>Pick vault</button>
    <div id="page-host" style={{ width: "calc(100vw - 200px)", marginLeft: 100, marginTop: 40 }}><PageNodeHeader node={nodes.find((n) => n.id === "page")!} nodes={nodes} onContentChange={update} onRename={() => {}} onImageFileUpload={upload} onUnsplashImageSelect={async () => "wide"} /></div>
    {open && <ImagePickerDialog title="Elegir imagen del Baúl" onClose={() => setOpen(false)}><IconCapabilityPicker nodes={nodes} tab={tab} onTabChange={setTab} currentImageId={vault.projectImageNodeId} currentPresentation={vault.projectPresentation} initialImageId={editCurrent ? vault.projectImageNodeId : null} onImageSelect={(id, p) => { vault.useAsCover(id, p); setOpen(false); }} onImageUpload={upload} onUnsplashSelect={async () => "wide"} onEmojiSelect={(value, style) => { vault.selectVisual({ kind: "emoji", value, style }); setOpen(false); }} onIconSelect={(provider, name) => { vault.selectVisual({ kind: "icon", provider, name }); setOpen(false); }} onClear={() => { vault.clear(); setOpen(false); }} clearLabel="Quitar imagen del Baúl" /></ImagePickerDialog>}
    <style>{".fixture-vault-image {width:100%;height:100%}"}</style>
  </>;
}
createRoot(document.getElementById("root")!).render(<LocaleProvider><Fixture /></LocaleProvider>);
