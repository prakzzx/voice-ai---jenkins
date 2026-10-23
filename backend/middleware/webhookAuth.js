// middleware/webhookAuth.js
// Optional shared-secret check for incoming Vapi webhooks.
//
// If VAPI_WEBHOOK_SECRET is NOT set, every request is allowed (same as before),
// so local development keeps working with no setup.
// If it IS set, requests must carry the same value in the "x-vapi-secret"
// header. Set the same value as the "Server URL Secret" in the Vapi dashboard.
// This stops strangers from POSTing fake events to /webhooks/vapi.

"use strict";

const crypto = require("crypto");

function webhookAuth(req, res, next) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) return next();

  const provided = Buffer.from(String(req.headers["x-vapi-secret"] || ""));
  const expected = Buffer.from(secret);

  const ok =
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected);

  if (!ok) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

module.exports = webhookAuth;
