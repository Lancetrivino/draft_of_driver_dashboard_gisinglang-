import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on LAN so a phone on the same Wi-Fi can open it during dev
  },
});
