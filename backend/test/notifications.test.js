"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const nodemailer = require("nodemailer");

const {
  notifyLead,
  getEnabledChannels,
  buildSlackMessage,
  buildEmail,
  sendSlackText,
  notifyConversationCompleted,
} = require("../services/notificationService");
const { registerTool } = require("../services/toolRegistry");
const callStateStore = require("../services/callStateStore");
const { processToolCalls } = require("../services/toolRouter");

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, () => resolve(server));
  });
}

const lead = { name: "John", company: "Google", email: "john@gmail.com" };

test("channels are enabled only when configured", () => {
  assert.deepStrictEqual(getEnabledChannels({}), []);
  assert.deepStrictEqual(getEnabledChannels({ SLACK_WEBHOOK_URL: "x" }), ["slack"]);
  assert.deepStrictEqual(getEnabledChannels({ SMTP_HOST: "h", NOTIFY_EMAIL_TO: "a@b.c" }), ["email"]);
  assert.deepStrictEqual(
    getEnabledChannels({ SLACK_WEBHOOK_URL: "x", SMTP_HOST: "h", NOTIFY_EMAIL_TO: "a@b.c", NOTIFY_CHANNELS: "slack" }),
    ["slack"]
  );
});

test("slack message escapes control characters", () => {
  const msg = buildSlackMessage({ ...lead, name: "<!channel> & co", savedAt: "now" });
  const json = JSON.stringify(msg);
  assert.ok(!json.includes("<!channel>"));
  assert.ok(json.includes("&lt;!channel&gt; &amp; co"));
});

test("email escapes HTML in lead data", () => {
  const mail = buildEmail({ ...lead, name: "<script>x</script>", savedAt: "now" }, { NOTIFY_EMAIL_TO: "a@b.c" });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
});

test("notifyLead posts to Slack webhook", async () => {
  let body = "";
  const server = await startServer((req, res) => {
    req.on("data", (c) => (body += c));
    req.on("end", () => res.end("ok"));
  });
  const url = `http://127.0.0.1:${server.address().port}/hook`;

  const outcome = await notifyLead(lead, { SLACK_WEBHOOK_URL: url });
  server.close();

  assert.deepStrictEqual(outcome.sent, ["slack"]);
  assert.ok(JSON.parse(body).text.includes("John"));
});

test("a failing channel does not throw and is reported", async () => {
  const outcome = await notifyLead(lead, { SLACK_WEBHOOK_URL: "http://127.0.0.1:1/nope" });
  assert.deepStrictEqual(outcome.sent, []);
  assert.strictEqual(outcome.failed[0].channel, "slack");
});

test("no channels configured is skipped, not an error", async () => {
  const outcome = await notifyLead(lead, {});
  assert.strictEqual(outcome.skipped, true);
});

test("saving a lead triggers notify_lead as a second tool", async () => {
  let slackBody = "";
  const slack = await startServer((req, res) => {
    req.on("data", (c) => (slackBody += c));
    req.on("end", () => res.end("ok"));
  });
  let leadBody = "";
  const leadApi = await startServer((req, res) => {
    req.on("data", (c) => (leadBody += c));
    req.on("end", () => res.end(JSON.stringify({ received: true })));
  });

  process.env.SLACK_WEBHOOK_URL = `http://127.0.0.1:${slack.address().port}/hook`;
  registerTool({ name: "send_lead", type: "webhook", method: "POST", url: `http://127.0.0.1:${leadApi.address().port}/lead` });
  registerTool({ name: "notify_lead", type: "notification" });

  callStateStore.initCall("c1", { stages: [{ name: "s" }] });
  callStateStore.getCall("c1").collectedData = lead;

  const results = await processToolCalls("c1", "please save this lead");
  slack.close();
  leadApi.close();
  delete process.env.SLACK_WEBHOOK_URL;

  assert.deepStrictEqual(results.map((r) => r.tool), ["send_lead", "notify_lead"]);
  assert.ok(results[1].result.success);
  assert.ok(JSON.parse(leadBody).email === "john@gmail.com");
  assert.ok(slackBody.includes("Google"));
});

test("notify_lead does not run when send_lead fails", async () => {
  registerTool({ name: "send_lead", type: "webhook", method: "POST", url: "http://127.0.0.1:1/down" });
  callStateStore.initCall("c2", { stages: [{ name: "s" }] });
  const results = await processToolCalls("c2", "save lead");
  assert.deepStrictEqual(results.map((r) => r.tool), ["send_lead"]);
  assert.strictEqual(results[0].result.success, false);
});

test("email goes through the SMTP transport", async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const sent = [];
  const orig = transport.sendMail.bind(transport);
  transport.sendMail = async (m) => { sent.push(m); return orig(m); };
  const { buildEmail: be } = require("../services/notificationService");
  await transport.sendMail(be({ ...lead, savedAt: "now" }, { NOTIFY_EMAIL_TO: "team@x.com", SMTP_FROM: "bot@x.com" }));
  assert.strictEqual(sent[0].to, "team@x.com");
  assert.ok(sent[0].subject.includes("John"));
});


test("chat completion sends a Slack notification without transcript contents", async () => {
  let body = "";
  const server = await startServer((req, res) => {
    req.on("data", (c) => (body += c));
    req.on("end", () => { res.writeHead(200); res.end("ok"); });
  });
  const env = { SLACK_WEBHOOK_URL: `http://127.0.0.1:${server.address().port}/hook` };
  const result = await notifyConversationCompleted({ id: "conv-test", agentName: "Demo Agent", duration: 42, summary: "Demo completed" }, env);
  server.close();
  assert.deepStrictEqual(result.sent, ["slack"]);
  const message = JSON.parse(body).text;
  assert.ok(message.includes("Voice AI chat completed"));
  assert.ok(message.includes("conv-test"));
  assert.ok(message.includes("42 seconds"));
});

test("generic Slack message is skipped when webhook is not configured", async () => {
  const result = await sendSlackText("test", {});
  assert.strictEqual(result.skipped, true);
});

test("slack_message tool delivers a mid-call alert via the router", async () => {
  let body = "";
  const server = await startServer((req, res) => {
    req.on("data", (c) => (body += c));
    req.on("end", () => res.end("ok"));
  });
  process.env.SLACK_WEBHOOK_URL = `http://127.0.0.1:${server.address().port}/hook`;
  registerTool({ name: "slack_message", type: "slack_message" });

  const results = await processToolCalls("c3", "please alert the team about this caller");
  server.close();
  delete process.env.SLACK_WEBHOOK_URL;

  assert.deepStrictEqual(results.map((r) => r.tool), ["slack_message"]);
  assert.strictEqual(results[0].result.success, true);
  assert.ok(JSON.parse(body).text.includes("mid-call alert"));
});

test("slack_message tool reports failure when Slack is not configured", async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  registerTool({ name: "slack_message", type: "slack_message" });
  const { executeTool } = require("../services/toolExecutor");
  const result = await executeTool("slack_message", { text: "hello" });
  assert.strictEqual(result.success, false);
  assert.ok(result.error.includes("not configured"));
});
