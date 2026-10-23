// services/notificationService.js
//
// Sends "new lead" notifications over Slack and/or email.
//
// Channels are enabled automatically when their env vars are present:
//   Slack : SLACK_WEBHOOK_URL
//   Email : SMTP_HOST + NOTIFY_EMAIL_TO  (plus SMTP_PORT/USER/PASS/FROM as needed)
//
// NOTIFY_CHANNELS (optional, e.g. "slack" or "email,slack") restricts which
// configured channels are actually used.
//
// Notification failures must never break the lead save, so every channel is
// isolated: errors are collected and returned, never thrown.

"use strict";

const axios = require("axios");
const nodemailer = require("nodemailer");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Slack mrkdwn only needs these three escaped.
function escapeSlack(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeLead(lead = {}) {
  return {
    name: lead.name || "Not provided",
    company: lead.company || "Not provided",
    email: lead.email || "Not provided",
    phone: lead.phone || null,
    conversationId: lead.conversationId || null,
    savedAt: lead.savedAt || new Date().toISOString(),
  };
}

function leadRows(lead) {
  const rows = [
    ["Name", lead.name],
    ["Company", lead.company],
    ["Email", lead.email],
  ];
  if (lead.phone) rows.push(["Phone", lead.phone]);
  if (lead.conversationId) rows.push(["Conversation", lead.conversationId]);
  rows.push(["Saved at", lead.savedAt]);
  return rows;
}

// ─── Channel configuration ────────────────────────────────────────────────────

function getEnabledChannels(env = process.env) {
  const configured = [];
  if (env.SLACK_WEBHOOK_URL) configured.push("slack");
  if (env.SMTP_HOST && env.NOTIFY_EMAIL_TO) configured.push("email");

  if (!env.NOTIFY_CHANNELS) return configured;

  const allowed = env.NOTIFY_CHANNELS.split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return configured.filter((c) => allowed.includes(c));
}

// ─── Slack ────────────────────────────────────────────────────────────────────

function buildSlackMessage(lead) {
  const fields = leadRows(lead).map(([label, value]) => ({
    type: "mrkdwn",
    text: `*${label}*\n${escapeSlack(value)}`,
  }));

  return {
    text: `New lead: ${escapeSlack(lead.name)} (${escapeSlack(lead.company)})`, // fallback for notifications
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "New lead captured" },
      },
      { type: "section", fields },
    ],
  };
}

async function sendSlack(lead, env = process.env) {
  await axios.post(env.SLACK_WEBHOOK_URL, buildSlackMessage(lead), {
    timeout: 8000,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Email ────────────────────────────────────────────────────────────────────

function buildEmail(lead, env = process.env) {
  const rows = leadRows(lead);

  const text = ["New lead captured", "", ...rows.map(([l, v]) => `${l}: ${v}`)].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px">
      <h2 style="margin:0 0 12px">New lead captured</h2>
      <table style="border-collapse:collapse;width:100%">
        ${rows
          .map(
            ([l, v]) =>
              `<tr>
                <td style="padding:6px 12px 6px 0;color:#555;vertical-align:top">${escapeHtml(l)}</td>
                <td style="padding:6px 0"><strong>${escapeHtml(v)}</strong></td>
              </tr>`
          )
          .join("")}
      </table>
    </div>`;

  return {
    from: env.SMTP_FROM || env.SMTP_USER || "prakati@localhost",
    to: env.NOTIFY_EMAIL_TO,
    subject: `New lead: ${lead.name} (${lead.company})`,
    text,
    html,
  };
}

function createTransport(env = process.env) {
  const port = Number(env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

async function sendEmail(lead, env = process.env, transport = createTransport(env)) {
  await transport.sendMail(buildEmail(lead, env));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Notify configured channels about a saved lead.
 * @returns {Promise<{sent: string[], failed: {channel: string, error: string}[], skipped: boolean}>}
 */
async function notifyLead(rawLead, env = process.env) {
  const lead = normalizeLead(rawLead);
  const channels = getEnabledChannels(env);

  if (channels.length === 0) {
    console.warn(
      "[notification] No channel configured. Set SLACK_WEBHOOK_URL and/or SMTP_HOST + NOTIFY_EMAIL_TO."
    );
    return { sent: [], failed: [], skipped: true };
  }

  const senders = { slack: sendSlack, email: sendEmail };
  const results = await Promise.allSettled(channels.map((c) => senders[c](lead, env)));

  const sent = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      sent.push(channels[i]);
    } else {
      console.error(`[notification] ${channels[i]} failed:`, r.reason?.message);
      failed.push({ channel: channels[i], error: r.reason?.message || "Unknown error" });
    }
  });

  return { sent, failed, skipped: false };
}

module.exports = {
  notifyLead,
  getEnabledChannels,
  buildSlackMessage,
  buildEmail,
};
