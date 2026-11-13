"use client";

import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export interface CollaboratorPresence {
  id: string;
  name: string;
  color: string;
}

export interface SupabaseYjsProviderOptions {
  documentId: string;
  doc: Y.Doc;
  supabase: SupabaseClient;
  user: CollaboratorPresence;
  enableRealtimeBroadcast?: boolean;
  onSyncStatusChange?: (status: "connecting" | "synced" | "offline") => void;
  onCollaboratorsChange?: (users: CollaboratorPresence[]) => void;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class SupabaseYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly indexeddb: IndexeddbPersistence;
  private channel: RealtimeChannel | null = null;
  private readonly documentId: string;
  private readonly supabase: SupabaseClient;
  private readonly user: CollaboratorPresence;
  private readonly enableRealtimeBroadcast: boolean;
  private readonly onSyncStatusChange?: (
    status: "connecting" | "synced" | "offline"
  ) => void;
  private readonly onCollaboratorsChange?: (
    users: CollaboratorPresence[]
  ) => void;
  private destroyed = false;

  constructor(options: SupabaseYjsProviderOptions) {
    this.doc = options.doc;
    this.documentId = options.documentId;
    this.supabase = options.supabase;
    this.user = options.user;
    this.enableRealtimeBroadcast = options.enableRealtimeBroadcast ?? true;
    this.onSyncStatusChange = options.onSyncStatusChange;
    this.onCollaboratorsChange = options.onCollaboratorsChange;

    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalStateField("user", {
      id: this.user.id,
      name: this.user.name,
      color: this.user.color,
    });

    // Offline-first CRDT persistence in IndexedDB
    const idbKey = this.enableRealtimeBroadcast
      ? `what-where-doc-${this.documentId}`
      : `what-where-vault-${this.documentId}`;
    this.indexeddb = new IndexeddbPersistence(idbKey, this.doc);

    this.doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);

    if (this.enableRealtimeBroadcast) {
      this.connectChannel();
    } else {
      this.onSyncStatusChange?.("synced");
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
  }

  private handleOnline = () => {
    if (this.destroyed || !this.enableRealtimeBroadcast) return;
    this.onSyncStatusChange?.("connecting");
    const sv = Y.encodeStateVector(this.doc);
    void this.channel?.send({
      type: "broadcast",
      event: "yjs-sync-step-1",
      payload: {
        senderId: this.user.id,
        stateVector: uint8ToBase64(sv),
      },
    });
  };

  private handleOffline = () => {
    this.onSyncStatusChange?.("offline");
  };

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (
      this.destroyed ||
      !this.enableRealtimeBroadcast ||
      origin === "remote" ||
      origin === "init"
    ) {
      return;
    }

    void this.channel?.send({
      type: "broadcast",
      event: "yjs-update",
      payload: {
        senderId: this.user.id,
        update: uint8ToBase64(update),
      },
    });
  };

  private handleAwarenessUpdate = (
    {
      added,
      updated,
      removed,
    }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (this.destroyed || !this.enableRealtimeBroadcast || origin === "remote") {
      return;
    }
    const changedClients = [...added, ...updated, ...removed];
    if (changedClients.length === 0) return;

    const encoded = encodeAwarenessUpdate(this.awareness, changedClients);
    void this.channel?.send({
      type: "broadcast",
      event: "yjs-awareness",
      payload: {
        senderId: this.user.id,
        update: uint8ToBase64(encoded),
      },
    });
  };

  private connectChannel() {
    this.onSyncStatusChange?.("connecting");
    const channel = this.supabase.channel(`doc:${this.documentId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.user.id },
      },
    });

    channel
      .on("broadcast", { event: "yjs-update" }, ({ payload }) => {
        if (!payload?.update || typeof payload.update !== "string") return;
        Y.applyUpdate(this.doc, base64ToUint8(payload.update), "remote");
      })
      .on("broadcast", { event: "yjs-sync-step-1" }, ({ payload }) => {
        if (!payload?.stateVector || typeof payload.stateVector !== "string") {
          return;
        }
        const remoteSv = base64ToUint8(payload.stateVector);
        const diff = Y.encodeStateAsUpdate(this.doc, remoteSv);
        if (diff.byteLength > 2) {
          void channel.send({
            type: "broadcast",
            event: "yjs-sync-step-2",
            payload: {
              senderId: this.user.id,
              update: uint8ToBase64(diff),
            },
          });
        }
      })
      .on("broadcast", { event: "yjs-sync-step-2" }, ({ payload }) => {
        if (!payload?.update || typeof payload.update !== "string") return;
        Y.applyUpdate(this.doc, base64ToUint8(payload.update), "remote");
        this.onSyncStatusChange?.("synced");
      })
      .on("broadcast", { event: "yjs-awareness" }, ({ payload }) => {
        if (!payload?.update || typeof payload.update !== "string") return;
        applyAwarenessUpdate(
          this.awareness,
          base64ToUint8(payload.update),
          "remote"
        );
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<CollaboratorPresence>();
        const users: CollaboratorPresence[] = [];
        for (const entries of Object.values(state)) {
          if (entries[0]) {
            users.push(entries[0]);
          }
        }
        this.onCollaboratorsChange?.(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track(this.user);
          const sv = Y.encodeStateVector(this.doc);
          await channel.send({
            type: "broadcast",
            event: "yjs-sync-step-1",
            payload: {
              senderId: this.user.id,
              stateVector: uint8ToBase64(sv),
            },
          });
          this.onSyncStatusChange?.("synced");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.onSyncStatusChange?.("offline");
        }
      });

    this.channel = channel;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);

    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }

    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.awareness.destroy();
    void this.indexeddb.destroy();
  }
}
