import app from "./api/index.ts";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const PORT = 3000;

// Serve frontend assets using Vite middleware or static files
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Website URL Extractor Indonesia running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  bootstrap();
}

export default app;
