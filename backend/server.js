// server.js
// Main Express application entry point.
//
// ARCHITECTURE: We keep server.js as the composition root.
// It wires together middleware, routes, and error handling.
// The actual business logic lives in services/controllers, not here.
// This makes the app structure immediately understandable.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const agentRoutes = require("./routes/agents");
const conversationRoutes = require("./routes/conversations");

const webhookRoutes = require("./routes/webhooks");
const errorHandler = require("./middleware/errorHandler");
const prisma = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3001;

const { registerTool } = require("./services/toolRegistry");
const webhookAuth = require("./middleware/webhookAuth");

// ─── Tool registry ────────────────────────────────────────────────────────────
// send_lead posts the lead to LEAD_WEBHOOK_URL. By default it calls this same
// server (see /api/lead below) so it works on any host, not only localhost:3001.
registerTool({
  name: "send_lead",
  type: "webhook",
  method: "POST",
  url: process.env.LEAD_WEBHOOK_URL || `http://127.0.0.1:${PORT}/api/lead`,
});

// notify_lead runs automatically after send_lead succeeds (see toolRouter.js).
// It was previously only registered inside the tests, so in a real run the
// Slack / email notification never fired.
registerTool({
  name: "notify_lead",
  type: "notification",
});

registerTool({
  name: "lookup_customer",
  type: "webhook",
  method: "POST",
  url: "https://your-api.com/customer",
});

// ─── Middleware ────────────────────────────────────────────────────────────────

// Running behind a reverse proxy (Caddy) in production.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5173",

    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-key",
      "x-demo-mode",
    ],
  })
);

// Request logging (combined in prod, dev format in development)
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// JSON body parsing — 10mb limit for conversation transcripts
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Internal lead endpoint (target of the send_lead tool) ────────────────────
// Registered AFTER express.json() so req.body is populated (it used to be
// registered before it, so the lead payload arrived as undefined).
// Only this server may call it: requests from other hosts are rejected.
const isLoopback = (addr = "") =>
  addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";

app.post("/api/lead", (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  console.log("[lead] received:", req.body);
  res.json({ received: req.body });
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/health", async (req, res) => {
  try {
    // Test DB connectivity
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
      version: "1.0.0",
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: error.message,
    });
  }
});
app.use(
"/agents",
agentRoutes
)
// ─── API Routes ───────────────────────────────────────────────────────────────

app.use("/api/agents", agentRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/webhooks", webhookAuth, webhookRoutes); // Webhooks at root level (no /api prefix)

// ─── API Info ─────────────────────────────────────────────────────────────────

app.get("/api", (req, res) => {
  res.json({
    name: "Prakati API",
    version: "1.0.0",
    endpoints: {
      agents: "/api/agents",
      conversations: "/api/conversations",
      webhooks: "/webhooks/vapi",
      health: "/health",
    },
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
// Must be last middleware — Express identifies error handlers by 4 args

app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║         Prakati API v1.0             ║
╠══════════════════════════════════════╣
║  Port:     ${PORT}                       ║
║  Env:      ${(process.env.NODE_ENV || "development").padEnd(12)}          ║
║  DB:       PostgreSQL via Prisma     ║
╚══════════════════════════════════════╝
  `);
});

// Graceful shutdown — close DB connections properly
process.on("SIGTERM", async () => {
  console.log("SIGTERM received — shutting down gracefully");
  await prisma.$disconnect();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
