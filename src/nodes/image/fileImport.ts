import type { FileImportModule } from "../../project/fileImportTypes";
import { FileNodeImportError } from "../../project/fileImportTypes";
import { hashFileBytes } from "../../project/fileHash";
import { deleteProjectResource, storeProjectResource } from "../../project/resourceRepository";
import { createProjectImageContent, getImageResourceDescriptor } from "../../utils/imageResource";

export const imageFileImportModule: FileImportModule = {
  definition: {
    kind: "image",
    nodeType: "imagen",
    storage: "project-resource",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif", "heic", "heif", "jfif"],
    mimePrefixes: ["image/"],
  },
  async prepare(file, context) {
    const data = new Uint8Array(await file.arrayBuffer());
    const hash = await hashFileBytes(data);
    // File names are labels, not identities. Anytype and screenshots routinely
    // reuse names such as "Imagen de Anytype 1.jpg" for different pixels.
    const existing = context.nodes.find((node) => {
      if (node.type !== "imagen") return false;
      const resource = getImageResourceDescriptor(node.content, node.name);
      // A new import must never silently choose the legacy inline representation.
      // Deduplication is limited to already canonical project resources.
      return resource?.storage === "project-resource" && resource.hash === hash;
    });
    if (existing) return { existing };

    const resourceId = crypto.randomUUID();
    const requestedExtension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : undefined;
    let stored;
    try {
      stored = await storeProjectResource("image", resourceId, data, requestedExtension);
    } catch (error) {
      console.error(error);
      throw new FileNodeImportError("fileImport.failed");
    }
    return {
      draft: {
        name: file.name,
        type: "imagen",
        content: createProjectImageContent({
          resourceId,
          fileName: file.name,
          fileSize: data.byteLength,
          mimeType: stored.mimeType,
          extension: stored.extension,
          hash,
          description: "",
          provenance: null,
        }),
      },
      rollback: () => deleteProjectResource("image", resourceId, stored.extension),
    };
  },
};
