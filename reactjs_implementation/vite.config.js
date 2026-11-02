import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  // Unified Checkout only accepts HTTPS target origins, so serve the dev server over TLS.
  plugins: [react(), basicSsl()],
});
