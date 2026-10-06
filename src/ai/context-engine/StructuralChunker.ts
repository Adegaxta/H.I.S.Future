import { hisLexicon } from "../../lexicon";
import type { AINodeStructure } from "../AINodeInspector";
import type { StructuralChunk } from "./types";
import { normalize, unique } from "./utils";

const TARGET_CHARS = 1_200;

interface Section { heading: string | null; level: number | null; blocks: string[] }

function sections(markdown: string): Section[] {
  const result: Section[] = [{ heading: null, level: null, blocks: [] }];
  for (const block of markdown.split(/\n{2,}/u).map((value) => value.trim()).filter(Boolean)) {
    const heading = block.match(/^(#{1,6})\s+(.+)$/u);
    if (heading) result.push({ heading: heading[2].trim(), level: heading[1].length, blocks: [block] });
    else result[result.length - 1].blocks.push(block);
  }
  return result.filter((section) => section.blocks.length > 0);
}

function packBlocks(blocks: readonly string[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (!current || current.length + block.length + 2 <= TARGET_CHARS) {
      current = current ? `${current}\n\n${block}` : block;
      continue;
    }
    chunks.push(current);
    current = block;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function chunkStructure(structure: AINodeStructure): StructuralChunk[] {
  const callIds = structure.calls.filter((call) => !call.broken).map((call) => call.targetId);
  let position = 0;
  return sections(structure.markdown).flatMap((section) => packBlocks(section.blocks).map((text) => {
    const analysis = hisLexicon.analyzeQuery(text);
    const entities = analysis.entities.filter((entity) => !entity.ambiguous).map((entity) => entity.canonical);
    const chunk: StructuralChunk = {
      id: `${structure.id}:${position}`,
      nodeId: structure.id,
      nodeName: structure.name,
      nodeType: structure.type,
      section: section.heading,
      headingLevel: section.level,
      position: position++,
      text,
      normalizedText: normalize(text),
      entities: unique(entities),
      callTargetIds: callIds,
    };
    return chunk;
  }));
}
