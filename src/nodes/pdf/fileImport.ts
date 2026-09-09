import { getDocument } from "../../pdf/pdfjs";
import { hashFileBytes } from "../../project/fileHash";
import type { FileImportModule } from "../../project/fileImportTypes";
import { FileNodeImportError } from "../../project/fileImportTypes";
import { deleteProjectResource, storeProjectResource } from "../../project/resourceRepository";
import { getProjectResourceDefinition } from "../../project/resourceRegistry";
import { createPdfContent } from "../../utils/pdfResource";

export const pdfFileImportModule: FileImportModule = {
  definition: {
    kind: "pdf",
    nodeType: "pdf",
    storage: "project-resource",
    extensions: [getProjectResourceDefinition("pdf")!.extension],
    exactMimeTypes: ["application/pdf"],
  },
  async prepare(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    try {
      loadingTask = getDocument({ data: data.slice() });
      await loadingTask.promise;
      await loadingTask.destroy();
    } catch (error) {
      if (loadingTask) await loadingTask.destroy().catch(() => undefined);
      console.error(error);
      throw new FileNodeImportError("fileImport.pdfInvalid");
    }

    const resourceId = crypto.randomUUID();
    const content = createPdfContent({
      resourceId,
      fileName: file.name,
      fileSize: file.size,
      hash: await hashFileBytes(data),
    });
    await storeProjectResource("pdf", resourceId, data);
    return {
      draft: { name: file.name, type: "pdf", content },
      rollback: () => deleteProjectResource("pdf", resourceId),
    };
  },
};
