"use client";

import dynamic from "next/dynamic";
import type { CollaborativeEditorProps } from "@/components/editor/CollaborativeEditorClient";

export const CollaborativeEditor = dynamic<CollaborativeEditorProps>(
  () => import("@/components/editor/CollaborativeEditorClient"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 py-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
      </div>
    ),
  }
);
