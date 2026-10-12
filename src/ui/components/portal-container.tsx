import { createContext, useContext, type ReactNode } from "react";

// Where overlays (tooltips, popovers, selects) render. Unset: the document
// body. UI inside a shadow root sets its own container so overlays get its
// styles.
const PortalContainerContext = createContext<HTMLElement | undefined>(
  undefined,
);

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | undefined;
  children: ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

export function usePortalContainer() {
  return useContext(PortalContainerContext);
}
