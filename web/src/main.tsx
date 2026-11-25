import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyAccent, readAccent } from "./theme/accentTheme";
import "./styles.css";

applyAccent(readAccent());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
