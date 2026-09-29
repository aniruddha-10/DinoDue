import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-500.css";
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/zilla-slab/latin-600.css";
import "../styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { t, uiLocale } from "../shared/i18n";
import { Forecast } from "./Forecast";

document.documentElement.lang = uiLocale();
document.title = t("pageTitle", t("forecastPageTitle"), t("extName"));
document.body.classList.add("page-body");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Forecast />
  </StrictMode>,
);
