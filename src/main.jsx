// Point d'entree React qui monte l'application, le routeur et les styles.
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./styles/global.css";
import "./styles/rh.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Active la navigation par URL dans toute l'application. */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
