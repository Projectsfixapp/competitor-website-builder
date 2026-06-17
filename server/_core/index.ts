import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter, registerAnalysisRoute } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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

// HTTP Basic Auth middleware – protects all routes when BASIC_AUTH_USER + BASIC_AUTH_PASS are set
function basicAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  // Skip if not configured or for health check
  if (!user || !pass || req.path === "/api/health") return next();
  const authHeader = req.headers["authorization"] || "";
  const b64 = authHeader.startsWith("Basic ") ? authHeader.slice(6) : "";
  const [u, p] = Buffer.from(b64, "base64").toString().split(":");
  if (u === user && p === pass) return next();
  res.set("WWW-Authenticate", 'Basic realm="Competitor Builder"');
  res.status(401).send("Zugang verweigert – bitte Benutzername und Passwort eingeben.");
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Apply Basic Auth before all routes
  app.use(basicAuthMiddleware);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerAnalysisRoute(app);

  // Health check endpoint (used by docker-compose and deploy.sh)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
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
}

startServer().catch(console.error);
