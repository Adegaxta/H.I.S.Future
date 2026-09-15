import { invoke } from "@tauri-apps/api/core";
import type { EditorImageLayout } from "../editor/imageResize";
import { measureLifecyclePhase } from "../lifecycle/metrics";
import { isDesktopRuntime } from "./runtime";

const browserLayouts = new Map<string, EditorImageLayout>();
const pendingWrites = new Set<Promise<void>>();

const layoutKey = (nodeId: string, blockId: string) => `${nodeId}\u0000${blockId}`;

export async function loadEditorImageLayouts(nodeId: string): Promise<EditorImageLayout[]> {
  if (!isDesktopRuntime()) {
    return [...browserLayouts.values()].filter((layout) => layout.nodeId === nodeId);
  }
  return measureLifecyclePhase("editor.image-layout.load", () =>
    invoke<EditorImageLayout[]>("list_editor_image_layouts", { nodeId }),
  );
}

export function saveEditorImageLayout(layout: EditorImageLayout): Promise<void> {
  const write = (async () => {
    if (!isDesktopRuntime()) {
      browserLayouts.set(layoutKey(layout.nodeId, layout.blockId), layout);
      return;
    }
    await measureLifecyclePhase("editor.image-layout.save", () =>
      invoke("save_editor_image_layout", {
        nodeId: layout.nodeId,
        blockId: layout.blockId,
        width: layout.width,
      }),
    );
  })();
  pendingWrites.add(write);
  void write.then(
    () => pendingWrites.delete(write),
    () => pendingWrites.delete(write),
  );
  return write;
}

export async function flushEditorLayoutWrites(): Promise<void> {
  while (pendingWrites.size) await Promise.all([...pendingWrites]);
}
