import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                app: fileURLToPath(new URL("./index.html", import.meta.url)),
                wrapper: fileURLToPath(new URL("./wrapper.html", import.meta.url)),
            },
        },
    },
    server: { host: "192.168.1.100" },
})
