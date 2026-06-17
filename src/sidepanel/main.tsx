import React from "react";
import { createRoot } from "react-dom/client";
import { SidePanel } from "./SidePanel";
import "./sidepanel.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
