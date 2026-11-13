"use client";

import Link from "next/link";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";
import { createReactInlineContentSpec } from "@blocknote/react";

export const PageMention = createReactInlineContentSpec(
  {
    type: "pageMention",
    propSchema: {
      documentId: {
        default: "",
      },
      title: {
        default: "Untitled",
      },
    },
    content: "none",
  },
  {
    render: (props) => {
      const docId = props.inlineContent.props.documentId;
      const title = props.inlineContent.props.title || "Untitled";
      return (
        <Link
          href={docId ? `/${docId}` : "#"}
          contentEditable={false}
          className="mx-0.5 inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-foreground underline decoration-border underline-offset-2 hover:bg-accent"
        >
          <span>@</span>
          <span>{title}</span>
        </Link>
      );
    },
  }
);

export const workspaceEditorSchema = BlockNoteSchema.create({
  blockSpecs: defaultBlockSpecs,
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    pageMention: PageMention,
  },
  styleSpecs: defaultStyleSpecs,
});

export type WorkspaceEditorSchema = typeof workspaceEditorSchema;
