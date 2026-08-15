import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PAID_INPUT_CREDITS_PER_1K,
  DEFAULT_PAID_OUTPUT_CREDITS_PER_1K,
  hasConfiguredModelPrice,
  withDefaultPaidModelPricing,
} from "./model-pricing.ts";

test("paid provider receives the standard credit price", () => {
  const model = withDefaultPaidModelPricing(
    {
      input_usd_per_million: 0,
      output_usd_per_million: 0,
      input_credits_per_1k: 0,
      output_credits_per_1k: 0,
    },
    "paid",
  );

  assert.equal(model.input_credits_per_1k, DEFAULT_PAID_INPUT_CREDITS_PER_1K);
  assert.equal(model.output_credits_per_1k, DEFAULT_PAID_OUTPUT_CREDITS_PER_1K);
  assert.equal(model["pricing_source"], "default_paid");
});

test("custom paid pricing is preserved", () => {
  const model = { input_credits_per_1k: 3, output_credits_per_1k: 8 };

  assert.equal(withDefaultPaidModelPricing(model, "paid"), model);
  assert.equal(hasConfiguredModelPrice(model), true);
});

test("free and all-plan providers may keep the minimum unpriced charge", () => {
  const model = { input_credits_per_1k: 0, output_credits_per_1k: 0 };

  assert.equal(withDefaultPaidModelPricing(model, "free"), model);
  assert.equal(withDefaultPaidModelPricing(model, "all"), model);
  assert.equal(hasConfiguredModelPrice(model), false);
});
