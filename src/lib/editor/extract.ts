export interface ExtractedMention {
  targetDocumentId: string;
  blockId: string;
}

interface GenericInlineNode {
  type?: string;
  text?: string;
  props?: Record<string, unknown>;
  content?: GenericInlineNode[];
}

interface GenericBlockNode {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  content?: GenericInlineNode[] | { rows?: Array<{ cells?: GenericInlineNode[][] }> };
  children?: GenericBlockNode[];
}

function collectInlineText(nodes: GenericInlineNode[], parts: string[]): void {
  for (const node of nodes) {
    if (typeof node.text === "string" && node.text.trim()) {
      parts.push(node.text);
    } else if (
      node.type === "pageMention" &&
      typeof node.props?.title === "string"
    ) {
      parts.push(`@${node.props.title}`);
    }
    if (Array.isArray(node.content)) {
      collectInlineText(node.content, parts);
    }
  }
}

export function extractPlainTextFromBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const parts: string[] = [];

  function walk(list: GenericBlockNode[]) {
    for (const block of list) {
      if (Array.isArray(block.content)) {
        collectInlineText(block.content, parts);
      } else if (
        block.content &&
        typeof block.content === "object" &&
        Array.isArray(block.content.rows)
      ) {
        for (const row of block.content.rows) {
          if (Array.isArray(row.cells)) {
            for (const cell of row.cells) {
              if (Array.isArray(cell)) {
                collectInlineText(cell, parts);
              }
            }
          }
        }
      }
      if (Array.isArray(block.children) && block.children.length > 0) {
        walk(block.children);
      }
    }
  }

  walk(blocks as GenericBlockNode[]);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function extractPageMentionsFromBlocks(
  blocks: unknown
): ExtractedMention[] {
  if (!Array.isArray(blocks)) return [];
  const seen = new Set<string>();
  const mentions: ExtractedMention[] = [];

  function walk(list: GenericBlockNode[]) {
    for (const block of list) {
      const blockId = typeof block.id === "string" && block.id ? block.id : "root";
      if (Array.isArray(block.content)) {
        for (const inline of block.content) {
          if (
            inline.type === "pageMention" &&
            typeof inline.props?.documentId === "string" &&
            inline.props.documentId
          ) {
            const targetDocumentId = inline.props.documentId;
            const key = `${targetDocumentId}:${blockId}`;
            if (!seen.has(key)) {
              seen.add(key);
              mentions.push({ targetDocumentId, blockId });
            }
          }
        }
      }
      if (Array.isArray(block.children) && block.children.length > 0) {
        walk(block.children);
      }
    }
  }

  walk(blocks as GenericBlockNode[]);
  return mentions;
}
