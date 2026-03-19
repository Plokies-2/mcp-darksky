import test from "node:test";
import assert from "node:assert/strict";
import { getLightPollutionMethodology } from "../src/light-pollution-methodology.js";

test("light-pollution methodology keeps evidence and guardrails attached", () => {
  const methodology = getLightPollutionMethodology();

  assert.equal(methodology.version, "2026-03-19-continuous-bortle-v2-korea-calibrated");
  assert.ok(
    methodology.evidence_sources.some((source) => source.id === "falchi2016"),
  );
  assert.ok(
    methodology.evidence_sources.some((source) => source.id === "duriscoe2018"),
  );
  assert.ok(
    methodology.evidence_sources.some((source) => source.id === "zheng2025"),
  );
  assert.match(methodology.outputs.estimated_bortle_center, /estimated/i);
  assert.ok(
    methodology.guardrails.some((guardrail) => /official or measured Bortle class/i.test(guardrail)),
  );
});
