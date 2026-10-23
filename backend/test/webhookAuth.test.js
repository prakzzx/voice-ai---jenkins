"use strict";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const webhookAuth = require("../middleware/webhookAuth");

function run(headers = {}) {
  let status = null;
  let nextCalled = false;
  const res = {
    status(code) { status = code; return this; },
    json() { return this; },
  };
  webhookAuth({ headers }, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

let saved;
beforeEach(() => { saved = process.env.VAPI_WEBHOOK_SECRET; });
afterEach(() => {
  if (saved === undefined) delete process.env.VAPI_WEBHOOK_SECRET;
  else process.env.VAPI_WEBHOOK_SECRET = saved;
});

test("allows everything when no secret is configured", () => {
  delete process.env.VAPI_WEBHOOK_SECRET;
  assert.strictEqual(run().nextCalled, true);
});

test("rejects a missing or wrong secret", () => {
  process.env.VAPI_WEBHOOK_SECRET = "s3cret";
  assert.strictEqual(run().status, 401);
  assert.strictEqual(run({ "x-vapi-secret": "nope" }).status, 401);
});

test("accepts the correct secret", () => {
  process.env.VAPI_WEBHOOK_SECRET = "s3cret";
  assert.strictEqual(run({ "x-vapi-secret": "s3cret" }).nextCalled, true);
});

test("tool webhook uses its own header and TOOL_WEBHOOK_SECRET", () => {
  const saved = process.env.TOOL_WEBHOOK_SECRET;
  process.env.VAPI_WEBHOOK_SECRET = "vapi";
  process.env.TOOL_WEBHOOK_SECRET = "tool";
  const call = (headers) => {
    let status = null, nextCalled = false;
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    webhookAuth({ headers, originalUrl: "/webhooks/tools" }, res, () => { nextCalled = true; });
    return { status, nextCalled };
  };
  assert.strictEqual(call({ "x-vapi-secret": "vapi" }).status, 401);
  assert.strictEqual(call({ "x-tool-webhook-secret": "tool" }).nextCalled, true);
  if (saved === undefined) delete process.env.TOOL_WEBHOOK_SECRET; else process.env.TOOL_WEBHOOK_SECRET = saved;
});
