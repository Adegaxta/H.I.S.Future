import { getProjectSetting, setProjectSetting } from "../project/settingsRepository";
import { parseImagePresentation, readSerializedImagePresentation, type ImagePresentation } from "../utils/imagePresentation";
import { parseVaultImageSetting, type VaultImageSetting } from "./vaultImageSetting";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { createProjectImageContent, getImageResourceDescriptor } from "../utils/imageResource";
import { acquireImageSource, type ResolvedImageLease } from "../utils/imageRuntimeResolver";
import { hashFileBytes } from "../project/fileHash";
import { storeProjectResource } from "../project/resourceRepository";
import { safeLocalStorageSet } from "./safeStorage";
import { parseNodeVisual, type NodeVisual } from "../nodes/visuals/types";

const COVER_NODE_NAME = "Imagen de portada";
type VaultVisual = Extract<NodeVisual, { kind: "emoji" | "icon" }>;

function readVaultVisual(key: string): VaultVisual | null {
  try {
    const visual = parseNodeVisual(JSON.parse(localStorage.getItem(key) || "null"));
    return visual && visual.kind !== "image" ? visual : null;
  } catch { return null; }
}

interface ProjectCoverOptions {
  projectKey: string;
  hydrated: boolean;
  nodes: NodeItem[];
  createNode: (name: string, type: "imagen", parentId: null, content: string) => string;
  updateContent: (id: string, content: string) => void;
  reportError?: (message: string) => void;
}

export function useProjectCover({ projectKey, hydrated, nodes, createNode, updateContent, reportError }: ProjectCoverOptions) {
  const storageKey = `hisfuture.project.cover-node.${projectKey}`;
  const [projectImage, setProjectImage] = useState<string | null>(null);
  const [, setSelection] = useState(0);
  const visualKey = `${storageKey}.visual`;
  const [projectVisual, setProjectVisual] = useState<VaultVisual | null>(() => readVaultVisual(visualKey));
  useEffect(() => { setProjectVisual(readVaultVisual(visualKey)); }, [visualKey]);
  const presentationKey = `${storageKey}.presentation`;
  const [projectPresentation, setProjectPresentation] = useState<ImagePresentation | undefined>(() => {
    try { return parseImagePresentation(JSON.parse(localStorage.getItem(presentationKey) || "null")); } catch { return undefined; }
  });
  useEffect(() => { setProjectPresentation(readSerializedImagePresentation(localStorage.getItem(presentationKey) ?? undefined)); }, [presentationKey]);
  const selectionRevision = useRef(0);
  const saves = useRef(Promise.resolve());
  const saveError = useRef<unknown>(null);
  const flushImageSelection = useCallback(async () => {
    await saves.current;
    if (saveError.current) throw saveError.current;
  }, []);
  const persistSelection = (value: VaultImageSetting) => {
    selectionRevision.current += 1;
    saves.current = saves.current.then(async () => { await setProjectSetting("vaultImage", JSON.stringify(value)); saveError.current = null; }).catch((error) => {
      saveError.current = error;
      const message = String(error); if (reportError) reportError(message); else console.error(message);
    });
  };
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const revision = selectionRevision.current;
    void getProjectSetting("vaultImage").then((raw) => {
      const saved = parseVaultImageSetting(raw);
      if (!active || revision !== selectionRevision.current || !saved) return;
      safeLocalStorageSet(storageKey, saved.nodeId ?? "none");
      safeLocalStorageSet(visualKey, JSON.stringify(saved.visual));
      safeLocalStorageSet(presentationKey, JSON.stringify(saved.presentation ?? null));
      setProjectVisual(saved.visual); setProjectPresentation(saved.presentation); setSelection((n) => n + 1);
    }).catch((error) => { if (active) console.warn("No se pudo leer la imagen del Baúl.", error); });
    return () => { active = false; };
  }, [hydrated, storageKey, visualKey, presentationKey]);
  const imageLeaseRef = useRef<ResolvedImageLease | null>(null);

  const findCoverNode = useCallback(() => {
    const storedId = localStorage.getItem(storageKey);
    if (storedId === "none") return undefined;
    return nodes.find((node) => node.id === storedId) ||
      nodes.find((node) => node.type === "imagen" && node.name === COVER_NODE_NAME);
  }, [nodes, storageKey]);

  const coverNode = findCoverNode();
  const coverId = coverNode?.id;
  const coverContent = coverNode?.content;
  const coverName = coverNode?.name;
  const resource = useMemo(() => coverContent === undefined ? null : getImageResourceDescriptor(coverContent, coverName || ""), [coverContent, coverName]);
  const resourceKey = resource?.storage === "project-resource"
    ? `${resource.resourceId}:${resource.extension}:${resource.hash}:${resource.mimeType}`
    : resource?.src;
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    imageLeaseRef.current?.release();
    imageLeaseRef.current = null;
    setProjectImage(null);
    if (coverNode) void acquireImageSource(coverNode).then((lease) => {
      if (!active) return lease.release();
      imageLeaseRef.current = lease;
      setProjectImage(lease.src);
    }).catch(() => { if (active) setProjectImage(null); });
    if (coverNode) safeLocalStorageSet(storageKey, coverNode.id);
    else if (localStorage.getItem(storageKey) !== "none") localStorage.removeItem(storageKey);
    return () => { active = false; imageLeaseRef.current?.release(); imageLeaseRef.current = null; };
    // Text edits elsewhere must not clear and reacquire the cover lease.
  }, [coverId, resourceKey, hydrated, storageKey]);
  const upload = useCallback((file: File) => {
    void (async () => {
      const data = new Uint8Array(await file.arrayBuffer());
      const resourceId = crypto.randomUUID();
      const requestedExtension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : undefined;
      const stored = await storeProjectResource("image", resourceId, data, requestedExtension);
      const content = createProjectImageContent({ resourceId, fileName: file.name || COVER_NODE_NAME, fileSize: data.byteLength, mimeType: stored.mimeType, extension: stored.extension, hash: await hashFileBytes(data), description: "Imagen de portada del proyecto", provenance: null });
      const coverNode = findCoverNode();
      if (coverNode) {
        updateContent(coverNode.id, content);
        safeLocalStorageSet(storageKey, coverNode.id);
        return;
      }
      const id = createNode(COVER_NODE_NAME, "imagen", null, content);
      safeLocalStorageSet(storageKey, id);
    })().catch((error) => console.error("No se pudo guardar la portada del proyecto.", error));
  }, [createNode, findCoverNode, storageKey, updateContent]);

  const updateImageContent = useCallback((id: string, content: string) => {
    updateContent(id, content);
  }, [updateContent]);

  const useAsCover = (nodeId: string, presentation?: ImagePresentation) => {
    const imageNode = nodes.find((node) => node.id === nodeId);
    if (imageNode && (imageNode.type !== "imagen" || !getImageResourceDescriptor(imageNode.content, imageNode.name))) return;
    setProjectVisual(null);
    setProjectPresentation(presentation);
    safeLocalStorageSet(presentationKey, JSON.stringify(presentation ?? null));
    persistSelection({ version: 1, nodeId, visual: null, presentation });
    localStorage.removeItem(visualKey);
    safeLocalStorageSet(storageKey, nodeId);
    setSelection((value) => value + 1);
  };

  const selectVisual = (visual: VaultVisual) => {
    persistSelection({ version: 1, nodeId: findCoverNode()?.id ?? null, visual });
    setProjectVisual(visual);
    setProjectPresentation(undefined);
    localStorage.removeItem(presentationKey);
    safeLocalStorageSet(visualKey, JSON.stringify(visual));
  };

  const clear = () => {
    persistSelection({ version: 1, nodeId: null, visual: null });
    setProjectPresentation(undefined);
    localStorage.removeItem(presentationKey);
    setProjectVisual(null);
    safeLocalStorageSet(visualKey, "null");
    // An explicit empty selection must not rediscover the legacy named cover.
    safeLocalStorageSet(storageKey, "none");
    setSelection((value) => value + 1);
  };

  return { projectImage, projectVisual, projectPresentation, projectImageNodeId: coverId, flushImageSelection, selectVisual, clear, upload, updateImageContent, useAsCover };
}
