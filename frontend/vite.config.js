import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as esbuild from "esbuild";

export default defineConfig({
    plugins: [
        // Преобразуем .js с JSX ПЕРЕД import-analysis
        {
            name: "force-jsx-loader-for-js",
            enforce: "pre",
            async transform(code, id) {
                if (id.endsWith(".js") && id.includes("/src/")) {
                    const out = await esbuild.transform(code, {
                        loader: "jsx",
                        jsx: "automatic" // React 17+
                    });
                    return { code: out.code, map: out.map };
                }
            }
        },
        react()
    ],
    server: {
        port: 5173,
        strictPort: true,
        // Если хочешь скрыть красный overlay ошибок:
        // hmr: { overlay: false }
    },
    // На всякий случай — для остальных стадий сборки
    esbuild: {
        loader: "jsx",
        include: /src\/.*\.js$/
    },
    optimizeDeps: {
        esbuildOptions: {
            loader: { ".js": "jsx" }
        }
    }
});
