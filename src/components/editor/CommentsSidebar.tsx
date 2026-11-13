"use client";

import * as React from "react";
import {
  CheckCircle2,
  MessageSquare,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  createCommentAction,
  deleteCommentAction,
  toggleResolveCommentThreadAction,
} from "@/actions/collaboration.actions";
import type { CommentRecord } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";

interface CommentsSidebarProps {
  documentId: string;
  activeBlockId: string;
  initialComments: CommentRecord[];
  currentUserId: string;
  onClose: () => void;
}

export function CommentsSidebar({
  documentId,
  activeBlockId,
  initialComments,
  currentUserId,
  onClose,
}: CommentsSidebarProps) {
  const [comments, setComments] =
    React.useState<CommentRecord[]>(initialComments);
  const [newBody, setNewBody] = React.useState("");
  const [replyBodies, setReplyBodies] = React.useState<Record<string, string>>(
    {}
  );
  const [showResolved, setShowResolved] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const threads = React.useMemo(() => {
    const grouped = new Map<string, CommentRecord[]>();
    for (const c of comments) {
      const list = grouped.get(c.thread_id) || [];
      list.push(c);
      grouped.set(c.thread_id, list);
    }
    return Array.from(grouped.entries())
      .map(([threadId, items]) => ({
        threadId,
        blockId: items[0]?.block_id || "page",
        resolved: items.every((i) => i.resolved),
        items,
      }))
      .filter((t) => (showResolved ? true : !t.resolved));
  }, [comments, showResolved]);

  async function handleCreateThread(e: React.FormEvent) {
    e.preventDefault();
    if (!newBody.trim()) return;
    setSubmitting(true);
    try {
      const created = await createCommentAction({
        documentId,
        blockId: activeBlockId || "page",
        body: newBody,
      });
      setComments((prev) => [...prev, created]);
      setNewBody("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(threadId: string, blockId: string) {
    const text = (replyBodies[threadId] || "").trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const created = await createCommentAction({
        documentId,
        blockId,
        threadId,
        body: text,
      });
      setComments((prev) => [...prev, created]);
      setReplyBodies((prev) => ({ ...prev, [threadId]: "" }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleResolve(threadId: string, nextResolved: boolean) {
    setComments((prev) =>
      prev.map((c) =>
        c.thread_id === threadId ? { ...c, resolved: nextResolved } : c
      )
    );
    await toggleResolveCommentThreadAction(documentId, threadId, nextResolved);
  }

  async function handleDelete(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    await deleteCommentAction(documentId, commentId);
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-secondary/30">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Comments</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowResolved((p) => !p)}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            {showResolved ? "Hide resolved" : "Show resolved"}
          </button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleCreateThread}
        className="border-b border-border p-3 space-y-2"
      >
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Anchor: block `{activeBlockId.slice(0, 8)}`</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Comment on selected block..."
            className="h-8 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            disabled={submitting || !newBody.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </form>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {threads.map((thread) => (
          <div
            key={thread.threadId}
            className="rounded-lg border border-border bg-card p-3 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="font-mono text-[10px]">
                #{thread.blockId.slice(0, 8)}
              </Badge>
              <button
                type="button"
                onClick={() =>
                  void handleToggleResolve(thread.threadId, !thread.resolved)
                }
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {thread.resolved ? (
                  <>
                    <RotateCcw className="h-3 w-3" />
                    Reopen
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Resolve
                  </>
                )}
              </button>
            </div>

            <div className="space-y-2">
              {thread.items.map((item) => (
                <div key={item.id} className="group text-xs space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {item.author?.display_name ||
                        item.author?.email ||
                        "Member"}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeDate(item.created_at)}
                      </span>
                      {item.author_id === currentUserId && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          aria-label="Delete comment"
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-secondary-foreground whitespace-pre-wrap">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            {!thread.resolved && (
              <div className="flex gap-1.5 pt-1">
                <Input
                  value={replyBodies[thread.threadId] || ""}
                  onChange={(e) =>
                    setReplyBodies((prev) => ({
                      ...prev,
                      [thread.threadId]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleReply(thread.threadId, thread.blockId);
                    }
                  }}
                  placeholder="Reply..."
                  className="h-7 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() =>
                    void handleReply(thread.threadId, thread.blockId)
                  }
                  className="h-7 px-2"
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {threads.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No {showResolved ? "" : "open "}comments on this page.
          </p>
        )}
      </div>
    </aside>
  );
}
