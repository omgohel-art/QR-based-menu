import "dotenv/config";
import { WebSocket } from "ws";
(globalThis as any).WebSocket = WebSocket;
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import net from "net";
import compression from "compression";
import { serveStatic, setupVite } from "./vite";
import paymentRoutes, { webhookRouter } from "./paymentRoutes";
import authRoutes from "./authRoutes";
import printRoutes from "./printRoutes";
import publicDataRoutes from "./publicDataApi";
import invoiceRoutes from "./invoiceRoutes";
import imageUploadRoutes from "./imageUploadRoutes";
import chatRoutes from "./chatRoutes";
import adminDataRoutes from "./adminDataRoutes";
import { getDb } from "../db";

// Guard: prevent accidental use of Razorpay test keys in production
if (process.env.NODE_ENV === "production") {
  const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "";
  if (razorpayKeyId.startsWith("rzp_test_")) {
    console.error("FATAL: Razorpay test keys detected in production! Set RAZORPAY_KEY_ID to a live key.");
    process.exit(1);
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Security middleware (self-contained, no external deps needed)
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  const origin = _req.headers.origin || "";
  const allowedOrigins = [
    process.env.CORS_ORIGIN || "http://localhost:5173",
    "http://localhost:3000",
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : []),
  ];
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (_req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
}

function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) return next();
  if (req.method === "POST" && (req.path === "/chat/stream" || req.path === "/api/chat/stream")) return next();
  const origin = req.headers["origin"] || req.headers["referer"] || "";
  if (!origin) {
    return res.status(403).json({ error: "CSRF validation failed" });
  }
  const allowedOrigins = [
    process.env.CORS_ORIGIN || "http://localhost:5173",
    "http://localhost:3000",
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : []),
  ];
  const originUrl = origin.replace(/\/$/, "");
  const isValid = allowedOrigins.some((a) => originUrl === a);
  if (!isValid) {
    return res.status(403).json({ error: "CSRF validation failed" });
  }
  next();
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust proxy for correct IP behind load balancers
  app.set("trust proxy", 1);

  // Security & parsing middleware
  app.use(securityHeaders);
  app.use(corsMiddleware);

  // Razorpay webhook — must be before JSON body parser (needs raw body for signature)
  app.use(webhookRouter);

  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

  // Handle malformed JSON body
  app.use((err: SyntaxError & { status?: number }, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "Invalid JSON in request body" });
    }
    next();
  });

  // Chat streaming — must be before compression (SSE needs raw response)
  app.use(chatRoutes);

  // Compress JSON and text responses (gzip). Skips <1KB, skips already-compressed payloads.
  app.use(compression({ threshold: 1024, level: 6 }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // CSRF protection for state-changing API routes
  app.use("/api", csrfProtection);

  // Routes
  app.use(paymentRoutes);
  app.use(authRoutes);
  app.use(printRoutes);
  app.use(publicDataRoutes);
  app.use(invoiceRoutes);
  app.use(imageUploadRoutes);
  app.use(adminDataRoutes);

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled server error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  // Development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    server.close();
    const { resetDb } = await import("../db");
    await resetDb();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Keep database connection alive — ping every 5 minutes
  setInterval(async () => {
    try {
      const db = await getDb();
      if (db) {
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`SELECT 1`);
      }
    } catch (err) {
      console.warn("[Keepalive] DB ping failed, will retry:", (err as Error).message);
      // Force reconnect on next request by resetting db
      const { resetDb } = await import("../db");
      await resetDb();
    }
  }, 5 * 60 * 1000);

  // Handle unhandled promise rejections gracefully
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
  });
}

startServer().catch(console.error);
