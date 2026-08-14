import assert from "node:assert/strict";
import test from "node:test";

import { billingEnvelope, OpenAiStreamMeter, SseEventDecoder } from "./openai-stream.server.ts";

test("SSE decoder preserves events across arbitrary chunks", () => {
  const decoder = new SseEventDecoder();
  assert.deepEqual(decoder.push("event: message\r\nda"), []);
  assert.deepEqual(decoder.push("ta: first\r\ndata: second\r\n\r\n"), [
    {
      event: "message",
      data: "first\nsecond",
      rawLines: ["event: message", "data: first", "data: second"],
    },
  ]);
  assert.deepEqual(decoder.push("data: [DO"), []);
  assert.equal(decoder.finish()[0]?.data, "[DO");
});

test("stream meter prefers exact provider usage", () => {
  const meter = new OpenAiStreamMeter();
  meter.observeData(
    JSON.stringify({
      choices: [{ delta: { content: "Olá" } }],
    }),
  );
  meter.observeData(
    JSON.stringify({
      choices: [],
      usage: { prompt_tokens: 123, completion_tokens: 17 },
    }),
  );

  assert.deepEqual(meter.usage(999), { input: 123, output: 17 });
  assert.equal(meter.hasBillablePayload(), true);
});

test("stream meter estimates text and tool deltas when usage is absent", () => {
  const meter = new OpenAiStreamMeter();
  meter.observeData(
    JSON.stringify({
      choices: [{ delta: { content: "12345678" } }],
    }),
  );
  meter.observeData(
    JSON.stringify({
      choices: [{ delta: { tool_calls: [{ function: { arguments: "abcd" } }] } }],
    }),
  );

  const usage = meter.usage(41);
  assert.equal(usage.input, 41);
  assert.ok(usage.output >= 3);
  assert.equal(meter.hasBillablePayload(), true);
});

test("stream meter detects provider error envelopes without billing them", () => {
  const meter = new OpenAiStreamMeter();
  meter.observeData(JSON.stringify({ error: { message: "upstream failed" } }));

  assert.equal(meter.errorMessage(), "upstream failed");
  assert.equal(meter.hasBillablePayload(), false);
});

test("billing envelope is an ignorable OpenAI chunk carrying usage and wallet", () => {
  const payload = billingEnvelope(
    "axion-1234567890123456",
    { input: 20, output: 5 },
    { creditsRemaining: 900 },
    true,
  );

  assert.deepEqual(payload.choices, []);
  assert.equal(payload.usage.total_tokens, 25);
  assert.equal(payload.axion_billing_pending, true);
  assert.deepEqual(payload.axion_wallet, { creditsRemaining: 900 });
});
