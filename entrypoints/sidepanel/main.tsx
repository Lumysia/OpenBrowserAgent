import { createRoot } from "react-dom/client";
import { SidepanelApp } from "./app";
import "../../src/ui/styles.css";
import { applyTheme } from "../../src/ui/apply-theme";

// Defaults until the stored preferences load, so the first paint is themed.
applyTheme(document.documentElement, {});

createRoot(document.getElementById("root")!).render(<SidepanelApp />);
