import test from "node:test";
import assert from "node:assert/strict";
import { findTargetMention, resolveTargetInput } from "../src/targets.js";

test("findTargetMention matches Korean target names with particles attached", () => {
  const match = findTargetMention("오늘 밤 오리온 성운을 찍기 어때?");

  assert.deepEqual(match, {
    name: "Orion Nebula",
    category: "deep_sky",
    key: "orion-nebula",
  });
});

test("resolveTargetInput canonicalizes known targets even when custom coordinates were supplied", () => {
  const resolved = resolveTargetInput({
    name: "M31 (Andromeda Galaxy)",
    ra_hours: 0.7,
    dec_degrees: 41.269,
    category: "Galaxy",
  });

  assert.equal(resolved.name, "Andromeda Galaxy");
  assert.equal(resolved.source, "catalog");
  assert.equal(resolved.category, "deep_sky");
});

test("resolveTargetInput accepts Milky Way aliases as the catalog target", () => {
  const resolved = resolveTargetInput({
    name: "Milky Way",
  });

  assert.equal(resolved.name, "Milky Way Core");
  assert.equal(resolved.source, "catalog");
  assert.equal(resolved.category, "milky_way");
});
