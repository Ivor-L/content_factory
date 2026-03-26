"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CanvasShellState = {
  active: boolean;
  projectId: string | null;
  projectName: string;
  isSaving: boolean;
  saveError: string | null;
  currentNodeId: string | null;
  currentNodeLabel: string | null;
  currentNodeType: string | null;
};

export type CanvasShellCommands = {
  focusNode?: (nodeId: string) => void;
  patchNode?: (nodeId: string, patch: Record<string, unknown>) => boolean;
  runNode?: (nodeId: string) => Promise<void> | void;
} | null;

type CanvasShellContextValue = {
  state: CanvasShellState;
  update: (
    next:
      | Partial<CanvasShellState>
      | ((prev: CanvasShellState) => Partial<CanvasShellState>),
  ) => void;
  reset: () => void;
  commands: CanvasShellCommands;
  registerCommands: (commands: CanvasShellCommands) => void;
};

const initialState: CanvasShellState = {
  active: false,
  projectId: null,
  projectName: "",
  isSaving: false,
  saveError: null,
  currentNodeId: null,
  currentNodeLabel: null,
  currentNodeType: null,
};

const CanvasShellContext = createContext<CanvasShellContextValue | null>(null);

export function CanvasShellProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CanvasShellState>(initialState);
  const [commands, setCommands] = useState<CanvasShellCommands>(null);

  const update = useCallback(
    (
      next:
        | Partial<CanvasShellState>
        | ((prev: CanvasShellState) => Partial<CanvasShellState>),
    ) => {
      setState((prev) => ({
        ...prev,
        ...(typeof next === "function" ? next(prev) : next),
      }));
    },
    [],
  );

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const registerCommands = useCallback((next: CanvasShellCommands) => {
    setCommands(next);
  }, []);

  const value = useMemo<CanvasShellContextValue>(
    () => ({ state, update, reset, commands, registerCommands }),
    [state, update, reset, commands, registerCommands],
  );

  return <CanvasShellContext.Provider value={value}>{children}</CanvasShellContext.Provider>;
}

export function useCanvasShell() {
  const context = useContext(CanvasShellContext);
  if (!context) {
    throw new Error("useCanvasShell must be used within a CanvasShellProvider");
  }
  return context;
}
