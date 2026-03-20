import test from "node:test";
import assert from "node:assert/strict";
import { resolveObservationIntent } from "../src/observation-intent.js";

test("resolves Milky Way wide-field intent from shooting_goal", () => {
  const intent = resolveObservationIntent({
    requestedMode: "general",
    shootingGoal: "2026-03-20 새벽 안반데기에서 은하수 광각 촬영 어때?",
  });

  assert.equal(intent.resolved_mode, "wide_field_milky_way");
  assert.equal(intent.target?.name, "Milky Way Core");
  assert.equal(intent.target_inferred_from_goal, true);
  assert.equal(intent.advanced_tip, null);
});

test("resolves star-trail intent without inventing a target", () => {
  const intent = resolveObservationIntent({
    requestedMode: "general",
    shootingGoal: "오늘 밤 구룡령터널에서 별궤적 찍기 괜찮아?",
  });

  assert.equal(intent.resolved_mode, "star_trail");
  assert.equal(intent.target, null);
  assert.equal(intent.advanced_tip, null);
});

test("resolves broadband deep-sky intent from target mention", () => {
  const intent = resolveObservationIntent({
    requestedMode: "general",
    shootingGoal: "안반데기에서 안드로메다 광대역 딥스카이 어때?",
  });

  assert.equal(intent.resolved_mode, "broadband_deep_sky");
  assert.equal(intent.target?.name, "Andromeda Galaxy");
  assert.equal(intent.target?.category, "deep_sky");
  assert.match(intent.advanced_tip ?? "", /광대역 기준/);
});

test("resolves narrowband deep-sky intent from filter wording", () => {
  const intent = resolveObservationIntent({
    requestedMode: "general",
    shootingGoal: "오늘 밤 오리온 성운을 듀얼내로우밴드로 찍기 어때?",
  });

  assert.equal(intent.resolved_mode, "narrowband_deep_sky");
  assert.equal(intent.target?.name, "Orion Nebula");
  assert.equal(intent.target?.category, "deep_sky");
  assert.match(intent.advanced_tip ?? "", /협대역 또는 듀얼밴드/);
});

test("keeps ambiguous requests in general mode", () => {
  const intent = resolveObservationIntent({
    requestedMode: "general",
    shootingGoal: "이번 주말에 갈 만해?",
  });

  assert.equal(intent.resolved_mode, "general");
  assert.equal(intent.target, null);
  assert.equal(intent.advanced_tip, null);
});
