"use strict";
const crypto = require("crypto");

function safeEqual(providedValue, expectedValue) {
  const provided = Buffer.from(String(providedValue || ""));
  const expected = Buffer.from(String(expectedValue || ""));
  return provided.length === expected.length && provided.length > 0 && crypto.timingSafeEqual(provided, expected);
}

function webhookAuth(req, res, next) {
  const isToolWebhook = String(req.originalUrl || req.url || "").split("?")[0].endsWith("/webhooks/tools");
  const secret = isToolWebhook ? (process.env.TOOL_WEBHOOK_SECRET || process.env.VAPI_WEBHOOK_SECRET) : process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "Webhook secret is not configured" });
    return next();
  }
  const provided = req.headers[isToolWebhook ? "x-tool-webhook-secret" : "x-vapi-secret"];
  if (!safeEqual(provided, secret)) return res.status(401).json({ error: "Unauthorized" });
  return next();
}
module.exports = webhookAuth;
