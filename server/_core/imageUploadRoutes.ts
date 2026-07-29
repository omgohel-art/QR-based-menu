import { Router } from "express";
import { processImage } from "./imageProcessor";
import { storagePut } from "../storage";
import { getUserIdFromToken } from "./authRoutes";

const router = Router();

router.post("/api/images/upload", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (max 10MB)" });
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > 10 * 1024 * 1024) {
        req.destroy();
        return res.status(413).json({ error: "File too large (max 10MB)" });
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const processed = await processImage(buffer);
    const timestamp = Date.now();
    const baseKey = `menu-images/${timestamp}`;

    const [origUrl, largeUrl, mediumUrl, thumbUrl] = await Promise.all([
      storagePut(`${baseKey}.webp`, processed.original, "image/webp"),
      storagePut(`${baseKey}_large.webp`, processed.large, "image/webp"),
      storagePut(`${baseKey}_medium.webp`, processed.medium, "image/webp"),
      storagePut(`${baseKey}_thumb.webp`, processed.thumbnail, "image/webp"),
    ]);

    return res.json({
      url: origUrl.url,
      largeUrl: largeUrl.url,
      mediumUrl: mediumUrl.url,
      thumbnailUrl: thumbUrl.url,
      width: processed.originalMeta.width,
      height: processed.originalMeta.height,
    });
  } catch (err: any) {
    console.error("Image upload failed:", err);
    return res.status(500).json({ error: "Image processing failed" });
  }
});

export default router;
