import { useCallback, useEffect, useState } from "react";
import type { NodeItem } from "../types/nodes";
import { createImageContent, getImageResourceInfo } from "../utils/imageResource";
import { safeLocalStorageSet } from "./safeStorage";

const COVER_NODE_NAME = "Imagen de portada";

interface ProjectCoverOptions {
  projectKey: string;
  hydrated: boolean;
  nodes: NodeItem[];
  createNode: (name: string, type: "imagen", parentId: null, content: string) => string;
  updateContent: (id: string, content: string) => void;
}

export function useProjectCover({ projectKey, hydrated, nodes, createNode, updateContent }: ProjectCoverOptions) {
  const storageKey = `hisfuture.project.cover-node.${projectKey}`;
  const [projectImage, setProjectImage] = useState<string | null>(null);

  const findCoverNode = useCallback(() => {
    const storedId = localStorage.getItem(storageKey);
    return nodes.find((node) => node.id === storedId) ||
      nodes.find((node) => node.type === "imagen" && node.name === COVER_NODE_NAME);
  }, [nodes, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const coverNode = findCoverNode();
    const source = coverNode
      ? getImageResourceInfo(coverNode.content, coverNode.name)?.src ?? null
      : null;
    setProjectImage((current) => current === source ? current : source);
    if (coverNode) safeLocalStorageSet(storageKey, coverNode.id);
    else localStorage.removeItem(storageKey);
  }, [findCoverNode, hydrated, storageKey]);

  const upload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setProjectImage(reader.result);
      const coverNode = findCoverNode();
      if (coverNode) {
        const resource = getImageResourceInfo(coverNode.content, coverNode.name);
        updateContent(coverNode.id, createImageContent(
          reader.result,
          resource?.fileName || COVER_NODE_NAME,
          0,
          resource?.hash || "",
          resource?.description || "Imagen de portada del proyecto",
        ));
        safeLocalStorageSet(storageKey, coverNode.id);
        return;
      }
      const id = createNode(COVER_NODE_NAME, "imagen", null, createImageContent(
        reader.result,
        COVER_NODE_NAME,
        0,
        "",
        "Imagen de portada del proyecto",
      ));
      safeLocalStorageSet(storageKey, id);
    };
    reader.readAsDataURL(file);
  }, [createNode, findCoverNode, storageKey, updateContent]);

  const updateImageContent = useCallback((id: string, content: string) => {
    updateContent(id, content);
    const imageNode = nodes.find((node) => node.id === id);
    if (imageNode && findCoverNode()?.id === id) {
      const resource = getImageResourceInfo(content, imageNode.name);
      if (resource) setProjectImage(resource.src);
    }
  }, [findCoverNode, nodes, updateContent]);

  const useAsCover = useCallback((nodeId: string) => {
    const imageNode = nodes.find((node) => node.id === nodeId);
    const resource = imageNode ? getImageResourceInfo(imageNode.content, imageNode.name) : null;
    if (!resource) return;
    setProjectImage(resource.src);
    safeLocalStorageSet(storageKey, nodeId);
  }, [nodes, storageKey]);

  return { projectImage, upload, updateImageContent, useAsCover };
}
