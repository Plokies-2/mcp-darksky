import { findTargetMention } from "./targets.js";

const STAR_TRAIL_PATTERNS = [
  /\bstar\s*trail(s)?\b/i,
  /\bstartrail(s)?\b/i,
  /별\s*궤적/u,
];

const MILKY_WAY_PATTERNS = [
  /\bmilky\s*way\b/i,
  /\bgalactic\s*core\b/i,
  /\bgalactic\s*center\b/i,
  /은하수/u,
];

const NIGHTSCAPE_PATTERNS = [
  /\bnight\s*scape\b/i,
  /\bnightscape\b/i,
  /\bforeground\b/i,
  /\blandscape\b/i,
  /야경/u,
  /풍경/u,
];

const NARROWBAND_PATTERNS = [
  /\bnarrow\s*band\b/i,
  /\bnarrowband\b/i,
  /\bdual\s*band\b/i,
  /\bduoband\b/i,
  /\bdual\s*narrow\s*band\b/i,
  /\bha\b/i,
  /\bh-?alpha\b/i,
  /\boiii\b/i,
  /\bsii\b/i,
  /\bsho\b/i,
  /협대역/u,
  /듀얼\s*(내로우)?\s*밴드/u,
];

const BROADBAND_PATTERNS = [
  /\bbroad\s*band\b/i,
  /\bbroadband\b/i,
  /\blrgb\b/i,
  /\brgb\b/i,
  /광대역/u,
];

const DEEP_SKY_PATTERNS = [
  /\bdeep\s*sky\b/i,
  /\bdeepsky\b/i,
  /\bnebula\b/i,
  /\bgalaxy\b/i,
  /\bcluster\b/i,
  /\bm\d{1,4}\b/i,
  /\bngc\s*\d{1,4}\b/i,
  /\bic\s*\d{1,4}\b/i,
  /딥스카이/u,
  /성운/u,
  /성단/u,
  /은하/u,
];

const EMISSION_NEBULA_PATTERNS = [
  /\bnebula\b/i,
  /\bm42\b/i,
  /\bm8\b/i,
  /\bngc\s*7000\b/i,
  /성운/u,
];

function matchAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function deriveIntentTags(text, targetInput) {
  const tags = new Set();
  const targetCategory = targetInput?.category ?? null;

  if (matchAny(text, STAR_TRAIL_PATTERNS)) {
    tags.add("star_trail");
  }
  if (matchAny(text, MILKY_WAY_PATTERNS) || targetCategory === "milky_way") {
    tags.add("milky_way");
    tags.add("wide_field");
  }
  if (matchAny(text, NIGHTSCAPE_PATTERNS) || targetCategory === "wide_field") {
    tags.add("wide_field");
    tags.add("nightscape");
  }
  if (matchAny(text, BROADBAND_PATTERNS)) {
    tags.add("filter_broadband");
  }
  if (matchAny(text, NARROWBAND_PATTERNS)) {
    tags.add("filter_narrowband");
  }
  if (matchAny(text, DEEP_SKY_PATTERNS) || targetCategory === "deep_sky") {
    tags.add("deep_sky");
  }
  if (matchAny(text, EMISSION_NEBULA_PATTERNS)) {
    tags.add("emission_nebula");
  }

  return Array.from(tags);
}

function inferModeFromTags(requestedMode, tags, targetInput) {
  if (requestedMode && requestedMode !== "general") {
    return {
      resolvedMode: requestedMode,
      resolutionReason: "explicit_mode",
    };
  }

  const tagSet = new Set(tags);
  const targetCategory = targetInput?.category ?? null;

  if (tagSet.has("star_trail")) {
    return {
      resolvedMode: "star_trail",
      resolutionReason: "shooting_goal_star_trail",
    };
  }

  if (tagSet.has("milky_way") || targetCategory === "milky_way") {
    return {
      resolvedMode: "wide_field_milky_way",
      resolutionReason: tagSet.has("milky_way") ? "shooting_goal_milky_way" : "target_category_milky_way",
    };
  }

  if (tagSet.has("filter_narrowband")) {
    return {
      resolvedMode: "narrowband_deep_sky",
      resolutionReason: "shooting_goal_narrowband",
    };
  }

  if (tagSet.has("deep_sky") || targetCategory === "deep_sky") {
    return {
      resolvedMode: "broadband_deep_sky",
      resolutionReason: tagSet.has("deep_sky") ? "shooting_goal_deep_sky" : "target_category_deep_sky",
    };
  }

  if (tagSet.has("wide_field") || targetCategory === "wide_field") {
    return {
      resolvedMode: "wide_field_nightscape",
      resolutionReason: tagSet.has("wide_field") ? "shooting_goal_wide_field" : "target_category_wide_field",
    };
  }

  return {
    resolvedMode: requestedMode ?? "general",
    resolutionReason: "default_general",
  };
}

function buildAdvancedTip(resolvedMode, tags, targetInput) {
  const tagSet = new Set(tags);
  const targetName = targetInput?.name ?? "이 타깃";

  if (resolvedMode === "broadband_deep_sky") {
    if (tagSet.has("emission_nebula")) {
      return `${targetName}처럼 성운 계열이면 협대역 또는 듀얼밴드 필터가 있다면 그쪽 세팅을 우선하세요`;
    }
    return "광대역 기준이라면 달빛과 투명도를 더 엄격하게 보고 판단하세요";
  }

  if (resolvedMode === "narrowband_deep_sky") {
    return "협대역 또는 듀얼밴드 필터가 있다면 달빛이 조금 남아도 그 구성이 더 버티기 쉽습니다";
  }

  return null;
}

export function resolveObservationIntent({ requestedMode = "general", shootingGoal = null, target = null } = {}) {
  const inferredTarget = target ?? (shootingGoal ? findTargetMention(shootingGoal) : null);
  const targetInput = inferredTarget
    ? {
        ...(target ?? {}),
        name: inferredTarget.name ?? target?.name,
        category: inferredTarget.category ?? target?.category,
      }
    : target;
  const text = [shootingGoal, targetInput?.name, targetInput?.category].filter(Boolean).join(" ").trim();
  const tags = deriveIntentTags(text, targetInput);
  const { resolvedMode, resolutionReason } = inferModeFromTags(requestedMode, tags, targetInput);

  return {
    requested_mode: requestedMode ?? "general",
    resolved_mode: resolvedMode,
    resolution_reason: resolutionReason,
    shooting_goal: shootingGoal ?? null,
    intent_tags: tags,
    target: targetInput ?? null,
    target_inferred_from_goal: !target && Boolean(inferredTarget),
    advanced_tip: buildAdvancedTip(resolvedMode, tags, targetInput),
  };
}
