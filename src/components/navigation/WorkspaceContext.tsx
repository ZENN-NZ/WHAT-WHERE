"use client";

import * as React from "react";
import type { DocumentTreeItem } from "@/types/database";

interface WorkspaceContextValue {
  items: DocumentTreeItem[];
  setItems: React.Dispatch<React.SetStateAction<DocumentTreeItem[]>>;
  unlockedTitles: Record<string, string>;
  setUnlockedTitle: (documentId: string, title: string) => void;
  clearUnlockedTitles: () => void;
  isSearchOpen: boolean;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  currentUser: {
    id: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
  };
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(
  null
);

export function WorkspaceProvider({
  initialItems,
  currentUser,
  children,
}: {
  initialItems: DocumentTreeItem[];
  currentUser: WorkspaceContextValue["currentUser"];
  children: React.ReactNode;
}) {
  const [items, setItems] = React.useState<DocumentTreeItem[]>(initialItems);
  const [unlockedTitles, setUnlockedTitles] = React.useState<
    Record<string, string>
  >({});
  const [isSearchOpen, setSearchOpen] = React.useState(false);

  React.useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const setUnlockedTitle = React.useCallback(
    (documentId: string, title: string) => {
      setUnlockedTitles((prev) =>
        prev[documentId] === title ? prev : { ...prev, [documentId]: title }
      );
    },
    []
  );

  const clearUnlockedTitles = React.useCallback(() => {
    setUnlockedTitles({});
  }, []);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        items,
        setItems,
        unlockedTitles,
        setUnlockedTitle,
        clearUnlockedTitles,
        isSearchOpen,
        setSearchOpen,
        currentUser,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return ctx;
}
