import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TaskDraft } from "../../src/shared/tasks/edit";

// Which view the side panel shows: the chat, its history, or the task list
// (with a task form prefilled from a chat when one asked for it).
export type SidepanelViewState =
  | { name: "chat" }
  | { name: "history" }
  | { name: "tasks"; draft?: Partial<TaskDraft> };

type Navigation = {
  view: SidepanelViewState;
  showChat(): void;
  showHistory(): void;
  showTasks(draft?: Partial<TaskDraft>): void;
};

const NavigationContext = createContext<Navigation | null>(null);

export function useNavigationState(): Navigation {
  const [view, setView] = useState<SidepanelViewState>({ name: "chat" });
  return useMemo(
    () => ({
      view,
      showChat: () => setView({ name: "chat" }),
      showHistory: () => setView({ name: "history" }),
      showTasks: (draft) => setView({ name: "tasks", draft }),
    }),
    [view],
  );
}

export function NavigationProvider({
  value,
  children,
}: {
  value: Navigation;
  children: ReactNode;
}) {
  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("useNavigation outside NavigationProvider");
  return navigation;
}
