import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANTE: cambia "cotizador-3d" por el nombre exacto de tu repositorio en GitHub.
// Si tu repo se llama "tu-usuario.github.io" (página de usuario), usa base: "/" en su lugar.
export default defineConfig({
  plugins: [react()],
  base: "/cotizador-3d/",
});
