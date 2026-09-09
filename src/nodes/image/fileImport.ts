import type { FileImportModule } from "../../project/fileImportTypes";
import { FileNodeImportError } from "../../project/fileImportTypes";
import { createImageContent, getImageResourceInfo, hashImageFile } from "../../utils/imageResource";

export const imageFileImportModule: FileImportModule = {
  definition: {
    kind: "image",
    nodeType: "imagen",
    storage: "inline",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif", "heic", "heif", "jfif"],
    mimePrefixes: ["image/"],
  },
  async prepare(file, context) {
    const hash = await hashImageFile(file);
    const existing = context.nodes.find((node) => node.type === "imagen" && (
      getImageResourceInfo(node.content, node.name)?.hash === hash ||
      getImageResourceInfo(node.content, node.name)?.fileName === file.name
    ));
    if (existing) return { existing };

    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new FileNodeImportError("fileImport.failed"));
      reader.onerror = () => reject(new FileNodeImportError("fileImport.failed"));
      reader.readAsDataURL(file);
    });
    return {
      draft: {
        name: file.name,
        type: "imagen",
        content: createImageContent(source, file.name, file.size, hash, ""),
      },
    };
  },
};
