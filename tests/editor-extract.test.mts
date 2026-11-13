import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPageMentionsFromBlocks,
  extractPlainTextFromBlocks,
} from "../src/lib/editor/extract.ts";

test("extractPlainTextFromBlocks extracts nested paragraph, table, and mention text", () => {
  const blocks = [
    {
      id: "b1",
      type: "heading",
      content: [{ type: "text", text: "Project Roadmap" }],
      children: [
        {
          id: "b2",
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            {
              type: "pageMention",
              props: { documentId: "doc-2", title: "Architecture" },
            },
          ],
        },
      ],
    },
  ];

  const text = extractPlainTextFromBlocks(blocks);
  assert.equal(text, "Project Roadmap See @Architecture");
});

test("extractPageMentionsFromBlocks deduplicates per target and block", () => {
  const blocks = [
    {
      id: "blk-1",
      type: "paragraph",
      content: [
        {
          type: "pageMention",
          props: { documentId: "target-a", title: "Alpha" },
        },
        {
          type: "pageMention",
          props: { documentId: "target-a", title: "Alpha" },
        },
      ],
      children: [
        {
          id: "blk-2",
          type: "paragraph",
          content: [
            {
              type: "pageMention",
              props: { documentId: "target-b", title: "Beta" },
            },
          ],
        },
      ],
    },
  ];

  const mentions = extractPageMentionsFromBlocks(blocks);
  assert.deepEqual(mentions, [
    { targetDocumentId: "target-a", blockId: "blk-1" },
    { targetDocumentId: "target-b", blockId: "blk-2" },
  ]);
});
