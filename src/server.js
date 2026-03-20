import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { APP_WIDGET_MIME_TYPE, APP_WIDGET_URI, buildAppWidgetPage } from "./app-widget.js";
import {
  getLightPollutionMethodologyReport,
  getLightPollutionReport,
  getNightSkyOutlookReport,
  getNightSkyScoreReport,
  getForecastDetailPolicy,
  scoreInputSchema,
} from "./service.js";

function getAppDomain(publicBaseUrl) {
  try {
    return new URL(publicBaseUrl).origin;
  } catch {
    return publicBaseUrl;
  }
}

function buildWidgetResourceMetadata(publicBaseUrl) {
  const appDomain = getAppDomain(publicBaseUrl);

  return {
    title: "mcp-darksky widget",
    description: "Interactive result card for dark-sky reports inside ChatGPT Apps.",
    mimeType: APP_WIDGET_MIME_TYPE,
    _meta: {
      ui: {
        domain: appDomain,
        prefersBorder: true,
        csp: {
          connectDomains: [],
          resourceDomains: [appDomain],
        },
      },
      "openai/widgetDescription":
        "Shows the score summary, best window, outlook blocks, and light-pollution context for mcp-darksky results.",
      "openai/widgetDomain": appDomain,
      "openai/widgetPrefersBorder": true,
      "openai/widgetCSP": {
        connectDomains: [],
        resourceDomains: [appDomain],
      },
    },
  };
}

function buildReadOnlyToolConfig({
  title,
  description,
  inputSchema,
  invoking,
  invoked,
  openWorldHint = false,
  withWidget = false,
}) {
  const meta = {
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  };

  if (withWidget) {
    meta.ui = {
      resourceUri: APP_WIDGET_URI,
    };
    meta["openai/outputTemplate"] = APP_WIDGET_URI;
  }

  return {
    title,
    description,
    inputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint,
    },
    _meta: meta,
  };
}

function getBriefingTimezone(report) {
  return report?.location?.timezone ?? "Asia/Seoul";
}

function formatLocalDateTimeLabel(value, timezone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    dateLabel: `${lookup.month}/${lookup.day}`,
    timeLabel: `${lookup.hour}:${lookup.minute}`,
  };
}

function formatWindowForBriefing(windowValue, timezone = "Asia/Seoul") {
  if (!windowValue) {
    return "n/a";
  }

  if (typeof windowValue === "string") {
    if (windowValue.includes("T")) {
      const formatted = formatLocalDateTimeLabel(windowValue, timezone);
      if (formatted) {
        return `${formatted.dateLabel} ${formatted.timeLabel}`;
      }
    }
    return windowValue;
  }

  if (typeof windowValue === "object" && windowValue.start && windowValue.end) {
    const start = formatLocalDateTimeLabel(windowValue.start, timezone);
    const end = formatLocalDateTimeLabel(windowValue.end, timezone);
    if (start && end) {
      if (start.dateLabel === end.dateLabel) {
        return `${start.dateLabel} ${start.timeLabel}-${end.timeLabel}`;
      }
      return `${start.dateLabel} ${start.timeLabel}-${end.dateLabel} ${end.timeLabel}`;
    }
    return `${windowValue.start} to ${windowValue.end}`;
  }

  return "n/a";
}

function formatTrendTimeLabel(value, timezone = "Asia/Seoul") {
  const formatted = formatLocalDateTimeLabel(value, timezone);
  if (!formatted) {
    return "n/a";
  }
  return `${formatted.dateLabel} ${formatted.timeLabel}`;
}

function formatTrendScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function escapeMarkdownCell(value) {
  return String(value ?? "n/a").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

function buildMarkdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map((_) => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`),
  ].join("\n");
}

function buildScoreTrendTable(report, timezone = "Asia/Seoul") {
  const hourlyConditions = Array.isArray(report?.hourly_conditions) ? report.hourly_conditions : [];
  if (!hourlyConditions.length) {
    return null;
  }

  return buildMarkdownTable(
    ["시간대", "점수", "핵심 변수"],
    hourlyConditions.map((hour) => [
      formatTrendTimeLabel(hour?.time, timezone),
      formatTrendScore(hour?.mode_score ?? hour?.overall_score),
      humanizeBlocker(hour?.primary_blocker) === "n/a" ? "-" : humanizeBlocker(hour?.primary_blocker),
    ]),
  );
}

function buildOutlookTrendTable(report, timezone = "Asia/Seoul") {
  const outlookBlocks = Array.isArray(report?.outlook_blocks) ? report.outlook_blocks : [];
  if (!outlookBlocks.length) {
    return null;
  }

  return buildMarkdownTable(
    ["시간대", "점수", "핵심 변수"],
    outlookBlocks.map((block) => [
      formatWindowForBriefing({ start: block?.start, end: block?.end }, timezone),
      formatTrendScore(block?.average_mode_score ?? block?.average_overall_score),
      humanizeBlocker(block?.primary_blocker) === "n/a" ? "-" : humanizeBlocker(block?.primary_blocker),
    ]),
  );
}

function collectPrimaryBlockers(report, limit = 2) {
  const items = Array.isArray(report?.blocker_timeline) ? report.blocker_timeline : [];
  return Array.from(
    new Set(
      items
        .map((item) => item?.primary_blocker)
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function humanizeVerdict(verdict) {
  if (verdict === "go") {
    return "가도 됨";
  }
  if (verdict === "no_go") {
    return "비추천";
  }
  return "애매함";
}

function humanizeBlocker(blocker) {
  const labels = {
    moonlight: "달빛",
    transparency: "투명도",
    cloud: "구름",
    target_altitude: "타깃 고도",
    hard_fail_weather: "강수/악천후",
    humidity: "습도",
    stability: "바람/흔들림",
    light_pollution: "광해",
  };

  return labels[blocker] ?? blocker ?? "n/a";
}

function buildTimingHint(report) {
  const trend = report?.curve_summary?.overall_trend;
  const period = report?.curve_summary?.best_period_label;

  if (trend === "improving") {
    return "이른 시간보다 뒤 시간이 더 유리한 흐름";
  }
  if (trend === "deteriorating") {
    return "초반이 더 낫고 뒤로 갈수록 약해지는 흐름";
  }
  if (period === "pre_dawn") {
    return "핵심 시간대가 새벽 쪽에 몰림";
  }
  if (period === "early_night") {
    return "초반 밤이 상대적으로 유리함";
  }

  return "시간대별 차이가 크지 않으면 best_window만 짧게 안내";
}

function classifyScore(score, { inverse = false } = {}) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return "정보 부족";
  }

  const value = Number(score);
  if (inverse) {
    if (value >= 75) {
      return "낮음";
    }
    if (value >= 50) {
      return "보통";
    }
    return "높음";
  }

  if (value >= 80) {
    return "좋음";
  }
  if (value >= 60) {
    return "보통";
  }
  return "아쉬움";
}

function buildSecondaryFactorSummary(report) {
  const scores = report?.scores ?? {};
  const bortleLabel =
    report?.light_pollution_context?.estimated_bortle_interval_label
    ?? report?.light_pollution_context?.estimated_bortle_band
    ?? "n/a";

  return [
    `구름 ${classifyScore(scores.cloud_score)}`,
    `투명도 ${classifyScore(scores.transparency_score)}`,
    `어둠 ${classifyScore(scores.darkness_score)}`,
    `이슬위험 ${classifyScore(scores.dew_risk_score, { inverse: true })}`,
    `안정도 ${classifyScore(scores.stability_score)}`,
    `광해 ${bortleLabel}`,
  ].join(", ");
}

function humanizeMode(mode) {
  const labels = {
    general: "일반 촬영",
    wide_field_milky_way: "광시야 은하수",
    wide_field_nightscape: "광시야 야경",
    broadband_deep_sky: "광대역 딥스카이",
    narrowband_deep_sky: "협대역 딥스카이",
    star_trail: "별궤적",
  };

  return labels[mode] ?? mode ?? "n/a";
}

function buildPurposeFitLabel(report) {
  const context = report?.request_context ?? {};
  const resolvedMode = context.resolved_mode ?? report?.scores?.active_mode ?? report?.summary?.active_mode;
  const targetName = report?.astronomy_context?.target?.name ?? context?.resolved_target?.name ?? null;

  return [humanizeMode(resolvedMode), targetName].filter(Boolean).join(" / ");
}

function buildReasonFocus(report) {
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";
  const targetName = report?.astronomy_context?.target?.name ?? "타깃";

  const labels = {
    general: "구름, 달빛, 투명도, 결로와 안정도",
    wide_field_milky_way: "은하수 고도, 달빛, 구름과 투명도",
    wide_field_nightscape: "달빛, 구름, 바람과 안정도",
    broadband_deep_sky: `${targetName} 고도, 달빛, 투명도`,
    narrowband_deep_sky: `${targetName} 고도, 안정도, 달빛`,
    star_trail: "긴 맑은 구간, 구름, 바람과 결로",
  };

  return labels[resolvedMode] ?? labels.general;
}

function buildSurveyFactors(report) {
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";

  const baseFactors = ["월령/달고도", "구름량", "투명도", "어둠", "이슬점 spread/결로 위험", "바람/안정도", "광해"];
  const modeExtras = {
    general: [],
    wide_field_milky_way: ["은하수 코어 가시성"],
    wide_field_nightscape: ["전경과 하늘의 균형"],
    broadband_deep_sky: ["타깃 고도"],
    narrowband_deep_sky: ["타깃 고도"],
    star_trail: ["장시간 맑은 구간"],
  };

  return [...baseFactors, ...(modeExtras[resolvedMode] ?? [])].join(", ");
}

function buildOperatorTip(report) {
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";
  const advancedTip = report?.request_context?.advanced_tip ?? null;

  if (advancedTip) {
    return advancedTip;
  }

  const defaults = {
    general: "지금은 일반 모드의 균형형 판단입니다. 찍고 싶은 테마를 은하수, 별궤적, 광대역/협대역 딥스카이처럼 정확히 말해주면 그 기준으로 다시 볼 수 있습니다.",
    wide_field_milky_way: "광각 은하수는 달빛이 빠진 뒤와 코어 고도가 올라오는 구간에 노출을 몰아주는 편이 안전합니다.",
    wide_field_nightscape: "전경을 함께 넣는다면 달 방향, 그림자, 바람에 의한 흔들림까지 같이 보고 구도를 고정하세요.",
    broadband_deep_sky: "광대역은 달빛과 투명도 변화에 민감하니 best window에 촬영 시간을 집중하는 편이 유리합니다.",
    narrowband_deep_sky: "협대역 필터가 있다면 달빛에는 조금 더 버티지만, 타깃 고도와 안정도는 계속 엄격하게 보세요.",
    star_trail: "별궤적은 장시간 누적이라 구름 유입, 배터리, 결로 관리가 점수만큼 중요합니다.",
  };

  return defaults[resolvedMode] ?? defaults.general;
}

function buildRequiredPreparation(report) {
  const items = [];
  const dewRiskScore = Number(report?.scores?.dew_risk_score);
  const stabilityScore = Number(report?.scores?.stability_score);
  const blockerItems = Array.isArray(report?.blocker_timeline)
    ? report.blocker_timeline.map((item) => item?.primary_blocker).filter(Boolean)
    : [];
  const outlookBlockers = Array.isArray(report?.outlook_blocks)
    ? report.outlook_blocks.map((item) => item?.primary_blocker).filter(Boolean)
    : [];
  const blockers = new Set([...blockerItems, ...outlookBlockers]);

  if (report?.derived_recommendations?.dew_heater_needed === true || (Number.isFinite(dewRiskScore) && dewRiskScore < 60) || blockers.has("humidity")) {
    items.push("렌즈히터 또는 결로 대비 장비");
  }

  if ((Number.isFinite(stabilityScore) && stabilityScore < 55) || blockers.has("stability")) {
    items.push("무거운 삼각대와 바람 대응 장비");
  }

  return items.length ? items.join(", ") : null;
}

function buildReplyContractLines(extraLines = []) {
  return [
    "Reply in Korean when the user asked in Korean.",
    "Write like a concise report with clear section labels, not a casual paragraph.",
    "Frame the answer as a comparison between what the user asked for and what the report supports.",
    "If the user asked about a specific time or target, answer that exact request first and compare it against the best window briefly.",
    "If request_context.resolved_mode is more specific than requested_mode, explain with the resolved purpose instead of falling back to generic weather commentary.",
    "Use concise wording, not a single-sentence restriction.",
    "Always present the time-based score trend as a compact markdown table when rows are available. Use the columns 시간대, 점수, 핵심 변수.",
    "Always emphasize the best time window with bold markdown.",
    "Use this fixed order by default: 추천 시간, 판단 이유, 시간대별 점수 추이 표, 이번 계산에 반영한 요소, 필요하면 필수 준비물, 숙련자 참고.",
    "Do not enumerate hourly scores, JSON fields, long background explanation, or a closing offer unless the user asks.",
    ...extraLines,
  ];
}

function buildScoreFallbackToolContent(report) {
  const recommendedTool = report?.recommended_tool ?? "score_night_sky_outlook";
  const recommendedMode = report?.recommended_input?.mode ?? "general";
  const requestedDate = report?.detail_policy?.requested_date ?? report?.recommended_input?.date ?? "n/a";

  return [
    ...buildReplyContractLines([
      "This payload means the requested date is outside the full-detail score horizon.",
      "Do not invent a detailed hourly verdict from this payload.",
      "Do not fabricate a time-based score table when full-detail rows are unavailable.",
      "Tell the user that the date should be handled by the outlook tool and keep the answer brief.",
    ]),
    "Use this answer skeleton by default:",
    "핵심 변수: 이 날짜는 세부 hourly score 범위를 넘어가는 날짜임.",
    "결론: 상세 점수보다 outlook으로 보는 편이 맞음.",
    `요청 시점: ${requestedDate}는 reduced-detail 구간이므로 full score 대신 coarse planning으로 답하기.`,
    `기타 변수: 추천 모드는 ${recommendedMode}.`,
    `추천 시간: ${recommendedTool}로 다시 조회.`,
    "Reference only. Do not expose these labels verbatim to the user:",
    `- report_kind: ${report?.report_kind ?? "n/a"}`,
    `- recommended_tool: ${recommendedTool}`,
    `- recommended_mode: ${recommendedMode}`,
    `- requested_date: ${requestedDate}`,
  ].join("\n");
}

export function buildScoreToolContent(report) {
  if (report?.report_kind === "fallback_required") {
    return buildScoreFallbackToolContent(report);
  }

  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.scores?.active_mode
    ?? report?.summary?.active_mode
    ?? "general";
  const timezone = getBriefingTimezone(report);
  const bestWindow = formatWindowForBriefing(
    report?.derived_recommendations?.mode_best_window ?? report?.derived_recommendations?.best_window,
    timezone,
  );
  const blockers = collectPrimaryBlockers(report).map(humanizeBlocker);
  const verdict = humanizeVerdict(report?.derived_recommendations?.go_no_go);
  const timingHint = buildTimingHint(report);
  const riskText = blockers.length ? blockers.join(", ") : "n/a";
  const secondaryFactors = buildSecondaryFactorSummary(report);
  const purposeFit = buildPurposeFitLabel(report);
  const reasonFocus = buildReasonFocus(report);
  const surveyFactors = buildSurveyFactors(report);
  const requiredPreparation = buildRequiredPreparation(report);
  const operatorTip = buildOperatorTip(report);
  const trendTable = buildScoreTrendTable(report, timezone);
  const ignoredTargetName = report?.request_context?.ignored_target_name ?? null;
  const generalModeGuard =
    resolvedMode === "general"
      ? [
        "When resolved_mode is general, keep the answer mode-neutral.",
        "Do not mention Milky Way, deep-sky, star-trail, target altitude, or filter advice unless the user explicitly asked for that subtype.",
        "Do not mention missing target planning or target-altitude limitations unless the user explicitly asked about a specific target.",
        "When resolved_mode is general, the final answer must explicitly say that if the user names the shooting theme more precisely, the system can re-check with a more purpose-fit mode.",
      ]
      : [];
  const ignoredTargetGuard = ignoredTargetName
    ? [
        `If ignored_target_name is present, say briefly that target-specific altitude planning was unavailable for '${ignoredTargetName}' and keep the answer focused on location/time conditions.`,
      ]
    : [];

  return [
    ...buildReplyContractLines(
      [
        ...generalModeGuard,
        ...ignoredTargetGuard,
        "The answer should read like a short field report, with one short paragraph or line per section.",
      ],
    ),
    "Use this answer skeleton by default:",
    `추천 시간: **${bestWindow}**.`,
    `판단 이유: ${reasonFocus} 중심으로 왜 이 시간이 가장 좋은지 설명하고, 사용자가 물은 시간이나 대상이 있다면 그 조건과 ${bestWindow}를 반드시 비교하기. 필요하면 ${timingHint}와 ${riskText}, ${secondaryFactors}를 참고하기.`,
    ...(trendTable ? ["시간대별 점수 추이:", trendTable] : []),
    `이번 계산에 반영한 요소: ${surveyFactors}.`,
    ...(requiredPreparation ? [`필수 준비물: ${requiredPreparation}.`] : []),
    `숙련자 참고: ${operatorTip}.`,
    "Reference only. Do not expose these labels verbatim to the user:",
    `- purpose_fit: ${purposeFit || "n/a"}`,
    `- best_window: ${bestWindow}`,
    `- timing_hint: ${timingHint}`,
    `- reason_focus: ${reasonFocus}`,
    `- survey_factors: ${surveyFactors}`,
    `- main_risks: ${riskText}`,
    `- secondary_factors: ${secondaryFactors}`,
    `- requested_mode: ${report?.request_context?.requested_mode ?? "n/a"}`,
    `- resolved_mode: ${report?.request_context?.resolved_mode ?? report?.scores?.active_mode ?? "n/a"}`,
    `- resolution_reason: ${report?.request_context?.resolution_reason ?? "n/a"}`,
    `- shooting_goal: ${report?.request_context?.shooting_goal ?? "n/a"}`,
    `- ignored_target_name: ${report?.request_context?.ignored_target_name ?? "n/a"}`,
    `- operator_tip: ${operatorTip}`,
    `- readiness: milky_way=${report?.derived_recommendations?.milky_way_ready ?? "n/a"}, deep_sky=${report?.derived_recommendations?.deep_sky_ready ?? "n/a"}`,
  ].join("\n");
}

export function buildOutlookToolContent(report) {
  const resolvedMode =
    report?.request_context?.resolved_mode
    ?? report?.summary?.active_mode
    ?? report?.scores?.active_mode
    ?? "general";
  const timezone = getBriefingTimezone(report);
  const blocks = Array.isArray(report?.outlook_blocks) ? report.outlook_blocks : [];
  const firstBlocker = humanizeBlocker(blocks.find((block) => block?.primary_blocker)?.primary_blocker ?? "n/a");
  const verdict = humanizeVerdict(report?.summary?.go_no_go_outlook);
  const bestBlock = formatWindowForBriefing(report?.summary?.best_block ?? report?.summary?.best_block_label, timezone);
  const purposeFit = buildPurposeFitLabel(report);
  const reasonFocus = buildReasonFocus(report);
  const surveyFactors = buildSurveyFactors(report);
  const requiredPreparation = buildRequiredPreparation(report);
  const operatorTip = buildOperatorTip(report);
  const trendTable = buildOutlookTrendTable(report, timezone);
  const ignoredTargetName = report?.request_context?.ignored_target_name ?? null;
  const generalModeGuard =
    resolvedMode === "general"
      ? [
          "When resolved_mode is general, keep the answer mode-neutral and planning-focused.",
          "Do not turn a general outlook into Milky Way, deep-sky, target-altitude, or filter-specific advice unless the user explicitly asked for that subtype.",
          "Recommend the best general observing block instead of any genre-specific peak.",
          "Do not mention missing target planning or target-altitude limitations unless the user explicitly asked about a specific target.",
          "When resolved_mode is general, the final answer must explicitly say that if the user names the shooting theme more precisely, the system can re-check with a more purpose-fit mode.",
        ]
      : [];
  const ignoredTargetGuard = ignoredTargetName
    ? [
        `If ignored_target_name is present, say briefly that target-specific altitude planning was unavailable for '${ignoredTargetName}' and keep the answer focused on location/time conditions.`,
      ]
    : [];

  return [
    ...buildReplyContractLines(
      [
        ...generalModeGuard,
        ...ignoredTargetGuard,
        "The answer should read like a short field report, with one short paragraph or line per section.",
      ],
    ),
    "Use this answer skeleton by default:",
    `추천 시간: **${bestBlock ?? "가장 높은 outlook block"}**.`,
    `판단 이유: ${reasonFocus} 중심으로 왜 이 planning block이 가장 좋은지 설명하고, 사용자가 물은 날짜나 시간대가 있다면 그 조건과 ${bestBlock ?? "가장 높은 outlook block"}을 반드시 비교하기. 필요하면 ${firstBlocker}와 outlook score를 참고하기.`,
    ...(trendTable ? ["시간대별 전망 추이:", trendTable] : []),
    `이번 계산에 반영한 요소: ${surveyFactors}.`,
    ...(requiredPreparation ? [`필수 준비물: ${requiredPreparation}.`] : []),
    `숙련자 참고: ${operatorTip}.`,
    "Reference only. Do not expose these labels verbatim to the user:",
    `- purpose_fit: ${purposeFit || "n/a"}`,
    `- overall_outlook_score: ${report?.summary?.overall_outlook_score ?? "n/a"}`,
    `- strongest_blocker: ${firstBlocker}`,
    `- best_block: ${bestBlock ?? "n/a"}`,
    `- reason_focus: ${reasonFocus}`,
    `- survey_factors: ${surveyFactors}`,
    `- requested_mode: ${report?.request_context?.requested_mode ?? "n/a"}`,
    `- resolved_mode: ${report?.request_context?.resolved_mode ?? report?.summary?.active_mode ?? "n/a"}`,
    `- resolution_reason: ${report?.request_context?.resolution_reason ?? "n/a"}`,
    `- shooting_goal: ${report?.request_context?.shooting_goal ?? "n/a"}`,
    `- ignored_target_name: ${report?.request_context?.ignored_target_name ?? "n/a"}`,
    `- operator_tip: ${operatorTip}`,
    `- outlook_blocks: ${blocks.length}`,
  ].join("\n");
}

function buildLightPollutionToolContent(report) {
  const context = report?.light_pollution_context ?? {};

  return [
    ...buildReplyContractLines([
      "For this tool, give the estimate first and only one caveat unless the user asks for methodology.",
    ]),
    "Quick facts:",
    `- location: ${report?.location?.name ?? "n/a"}`,
    `- estimated_bortle_center: ${context?.estimated_bortle_center ?? "n/a"}`,
    `- estimated_bortle_band: ${context?.estimated_bortle_band ?? "n/a"}`,
    `- zenith_brightness_mpsas: ${context?.equivalent_zenith_brightness_mpsas ?? "n/a"}`,
  ].join("\n");
}

function buildLinksToolContent(links) {
  return [
    ...buildReplyContractLines([
      "For this tool, mention only the recommended link or endpoint unless the user asks for all of them.",
    ]),
    "Quick facts:",
    `- recommended_tool: ${links?.recommended_tool ?? "n/a"}`,
    `- mcp_endpoint: ${links?.mcp_endpoint ?? "n/a"}`,
    `- json_api_url: ${links?.json_api_url ?? "n/a"}`,
    `- json_outlook_api_url: ${links?.json_outlook_api_url ?? "n/a"}`,
  ].join("\n");
}

function buildMethodologyToolContent() {
  return [
    ...buildReplyContractLines([
      "Summarize the method in plain language and avoid a long checklist unless the user asks for it.",
    ]),
    "Quick facts:",
    "- focus: evidence, guardrails, and limits of the light-pollution estimate",
  ].join("\n");
}

function buildScoringModelToolContent() {
  return [
    ...buildReplyContractLines([
      "Explain only the fields needed for the user's question and avoid describing the full schema by default.",
    ]),
    "Quick facts:",
    "- focus: overall score, best window, blockers, and readiness flags first",
  ].join("\n");
}

export function createDarkSkyServer({ publicBaseUrl = "http://localhost:3000", kakaoRestApiKey } = {}) {
  const scoreModeSchema = z.enum([
    "general",
    "wide_field_milky_way",
    "wide_field_nightscape",
    "broadband_deep_sky",
    "narrowband_deep_sky",
    "star_trail",
  ]).default("general");

  const server = new McpServer({
    name: "mcp-darksky",
    version: "0.3.0",
  });

  server.registerResource(
    "darksky-report-widget",
    APP_WIDGET_URI,
    buildWidgetResourceMetadata(publicBaseUrl),
    async () => ({
      contents: [
        {
          uri: APP_WIDGET_URI,
          mimeType: APP_WIDGET_MIME_TYPE,
          text: buildAppWidgetPage(),
        },
      ],
    }),
  );

  const scoreToolTargetInputSchema = z.object({
    name: z
      .string()
      .min(2)
      .optional()
      .describe("Known target name such as 'Andromeda Galaxy', 'Orion Nebula', or 'Milky Way Core'. Use only when the user explicitly named a target. Do not invent target names, custom coordinates, or category labels. Never use placeholders like 'general', 'none', 'sky', '하늘', or '일반'."),
  }).strict();

  const scoreToolInputSchema = z.object({
    place_query: z.string().min(2).optional().describe("Korean place name or address resolved through Kakao Local API. Use the user's raw Korean place name directly before asking a follow-up."),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Local observation date in YYYY-MM-DD."),
    location_name: z.string().optional().describe("Optional display label copied from the user's location wording. Do not invent extra qualifiers."),
    timezone: z.string().default("Asia/Seoul"),
    mode: scoreModeSchema.describe(
      "Scoring preset: general, wide_field_milky_way, wide_field_nightscape, broadband_deep_sky, narrowband_deep_sky, star_trail.",
    ),
    shooting_goal: z
      .string()
      .min(2)
      .max(200)
      .optional()
      .describe("Optional free-text shooting intent such as '은하수', '별궤적', 'M42 광대역', or '북아메리카 성운 협대역'. Use this when the user explicitly named a celestial subject or directly named a shooting type like Milky Way or star trail. If no celestial target is explicitly stated, keep mode as general by default instead of upgrading to a target-specific deep-sky mode. If the purpose is vague, keep mode as general and pass the raw wording here instead of asking a clarifying question first. Do not rewrite a vague request into a specific Milky Way or deep-sky subtype."),
    target: scoreToolTargetInputSchema.optional(),
  }).strict();

  server.registerTool(
    "score_night_sky",
    buildReadOnlyToolConfig({
      title: "Score night sky conditions",
      description:
        "Use this when you want a detailed dark-sky score, timing windows, and astrophotography recommendations for a Korean observing site for dates up to roughly 5 days ahead. If the user gives a Korean place name, call the tool with place_query before asking follow-up questions. Fill shooting_goal when the user clearly implies a purpose such as Milky Way, star trail, broadband deep-sky, or narrowband deep-sky even if mode is omitted. However, if the user did not explicitly name a celestial target, keep mode as general by default unless they directly named a shooting type like Milky Way or star trail. If the purpose is vague, default to general mode and still call the tool instead of asking a clarifying question first, and do not rewrite a vague request into a specific Milky Way or deep-sky subtype. Prefer the user's raw place_query and a known target name only. For general or vague requests, omit target entirely. Do not invent target names or unsupported fields. When explaining results, compare the user's requested target or time against the best window, present the time-based score trend as a compact table, explicitly highlight the best window, and keep the answer in a short report order: best time window, reason and comparison, trend table, survey factors, expert tip.",
      inputSchema: scoreToolInputSchema,
      invoking: "Scoring sky conditions",
      invoked: "Sky score ready",
      openWorldHint: true,
      withWidget: true,
    }),
    async (input) => {
      const report = await getNightSkyScoreReport({
        ...input,
        kakaoRestApiKey,
        publicBaseUrl,
      });

      return {
        content: [
          {
            type: "text",
            text: buildScoreToolContent(report),
          },
        ],
        structuredContent: report,
      };
    },
  );

  const outlookToolInputSchema = z.object({
    place_query: z.string().min(2).optional().describe("Korean place name or address resolved through Kakao Local API. Use the user's raw Korean place name directly before asking a follow-up."),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Local observation date in YYYY-MM-DD."),
    location_name: z.string().optional().describe("Optional display label copied from the user's location wording. Do not invent extra qualifiers."),
    timezone: z.string().default("Asia/Seoul"),
    mode: scoreModeSchema.describe(
      "Coarse outlook preset: general, wide_field_milky_way, wide_field_nightscape, broadband_deep_sky, narrowband_deep_sky, star_trail.",
    ),
    shooting_goal: z
      .string()
      .min(2)
      .max(200)
      .optional()
      .describe("Optional free-text shooting intent used to resolve the right planning mode when the user did not spell it out. Use this when the user explicitly named a celestial subject or directly named a shooting type like Milky Way or star trail. If no celestial target is explicitly stated, keep mode as general by default instead of upgrading to a target-specific deep-sky mode. If the purpose is vague, keep mode as general and pass the raw wording here instead of asking a clarifying question first. Do not rewrite a vague request into a specific Milky Way or deep-sky subtype."),
    target: scoreToolTargetInputSchema.optional(),
  }).strict();

  server.registerTool(
    "score_night_sky_outlook",
    buildReadOnlyToolConfig({
      title: "Get a coarse night outlook",
      description:
        "Use this when the target date is farther out and you only need a coarse planning outlook instead of full hourly detail, especially beyond roughly 5 days ahead. If the user gives a Korean place name, call the tool with place_query before asking follow-up questions. Fill shooting_goal when the user implies a purpose such as Milky Way, star trail, or deep-sky. However, if the user did not explicitly name a celestial target, keep mode as general by default unless they directly named a shooting type like Milky Way or star trail. If the purpose is vague, default to general mode and still call the tool instead of asking a clarifying question first, and do not rewrite a vague request into a specific Milky Way or deep-sky subtype. Prefer the user's raw place_query and a known target name only. For general or vague requests, omit target entirely. Do not invent target names or unsupported fields. When explaining results, compare the user's requested target or time against the best planning block, present the block trend as a compact table, explicitly highlight the best block, and keep the answer in a short report order: best time window, reason and comparison, trend table, survey factors, expert tip.",
      inputSchema: outlookToolInputSchema,
      invoking: "Building night outlook",
      invoked: "Night outlook ready",
      openWorldHint: true,
      withWidget: true,
    }),
    async (input) => {
      const report = await getNightSkyOutlookReport({
        ...input,
        kakaoRestApiKey,
      });

      return {
        content: [
          {
            type: "text",
            text: buildOutlookToolContent(report),
          },
        ],
        structuredContent: report,
      };
    },
  );

  server.registerTool(
    "estimate_light_pollution",
    buildReadOnlyToolConfig({
      title: "Estimate light pollution and Bortle-like class",
      description:
        "Use this when you want a local light-pollution baseline and Bortle-like estimate for a Korean location. When explaining results, keep the estimate concise and tie it back to the user's requested target or shooting plan instead of giving a long standalone explanation.",
      inputSchema: z.object({
        place_query: z.string().min(2).optional().describe("Korean place name or address resolved through Kakao Local API."),
        location_name: z.string().optional(),
      }).strict(),
      invoking: "Estimating light pollution",
      invoked: "Light estimate ready",
      openWorldHint: true,
      withWidget: true,
    }),
    async (input) => {
      const report = await getLightPollutionReport({
        ...input,
        kakaoRestApiKey,
      });

      return {
        content: [
          {
            type: "text",
            text: buildLightPollutionToolContent(report),
          },
        ],
        structuredContent: report,
      };
    },
  );

  server.registerTool(
    "describe_light_pollution_method",
    buildReadOnlyToolConfig({
      title: "Describe the light-pollution estimation method",
      description:
        "Use this when you need the methodology, guardrails, and benchmark notes behind the light-pollution estimate. Summarize briefly by default and expand only when the user asks for methodology detail.",
      inputSchema: {},
      invoking: "Loading methodology",
      invoked: "Methodology ready",
    }),
    async () => {
      const report = getLightPollutionMethodologyReport();

      return {
        content: [
          {
            type: "text",
            text: buildMethodologyToolContent(),
          },
        ],
        structuredContent: report,
      };
    },
  );

  server.registerTool(
    "score_night_sky_via_link",
    buildReadOnlyToolConfig({
      title: "Get a shareable score link",
      description:
        "Use this when you want the same query as reusable links for MCP, JSON API, and prompt fallback entrypoints. Mention only the most relevant link by default unless the user asks for all link variants.",
      inputSchema: scoreToolInputSchema,
      invoking: "Building share links",
      invoked: "Share links ready",
      withWidget: true,
    }),
    async (input) => {
      const parsed = scoreInputSchema.parse(input);
      const detailPolicy = getForecastDetailPolicy(parsed.date, parsed.timezone);
      const params = new URLSearchParams({
        date: parsed.date,
        timezone: parsed.timezone,
      });

      if (parsed.latitude !== undefined && parsed.longitude !== undefined) {
        params.set("latitude", String(parsed.latitude));
        params.set("longitude", String(parsed.longitude));
      }
      if (parsed.place_query) {
        params.set("place_query", parsed.place_query);
      }

      if (parsed.location_name) {
        params.set("location_name", parsed.location_name);
      }
      if (parsed.shooting_goal) {
        params.set("shooting_goal", parsed.shooting_goal);
      }
      if (parsed.site_profile?.bortle_class !== undefined) {
        params.set("bortle_class", String(parsed.site_profile.bortle_class));
      }
      if (parsed.site_profile?.elevation_m !== undefined) {
        params.set("elevation_m", String(parsed.site_profile.elevation_m));
      }
      if (parsed.site_profile?.near_water !== undefined) {
        params.set("near_water", String(parsed.site_profile.near_water));
      }
      if (parsed.mode && parsed.mode !== "general") {
        params.set("mode", parsed.mode);
      }
      if (parsed.target?.name) {
        params.set("target_name", parsed.target.name);
      }
      if (parsed.target?.ra_hours !== undefined) {
        params.set("target_ra_hours", String(parsed.target.ra_hours));
      }
      if (parsed.target?.dec_degrees !== undefined) {
        params.set("target_dec_degrees", String(parsed.target.dec_degrees));
      }
      if (parsed.target?.category) {
        params.set("target_category", parsed.target.category);
      }

      const links = {
        mcp_endpoint: `${publicBaseUrl}/mcp`,
        json_api_url: `${publicBaseUrl}/api/score?${params.toString()}`,
        json_outlook_api_url: `${publicBaseUrl}/api/score-outlook?${params.toString()}`,
        prompt_url: `${publicBaseUrl}/prompt`,
        install_url: `${publicBaseUrl}/install`,
        recommended_tool: detailPolicy.requires_outlook_path ? "score_night_sky_outlook" : "score_night_sky",
      };

      return {
        content: [
          {
            type: "text",
            text: buildLinksToolContent(links),
          },
        ],
        structuredContent: links,
      };
    },
  );

  server.registerTool(
    "describe_scoring_model",
    buildReadOnlyToolConfig({
      title: "Describe scoring model",
      description:
        "Use this when you need an interpretation guide for the score fields, derived recommendations, and timing outputs. Explain only the fields relevant to the user's question unless they ask for the full model.",
      inputSchema: {},
      invoking: "Loading scoring guide",
      invoked: "Scoring guide ready",
    }),
    async () => {
      const modelDescription = {
        scores: {
          overall_score: "0-100 combined suitability for night sky photography.",
          mode_score: "0-100 suitability for the selected shooting mode.",
          cloud_score: "Weighted by low/mid/high cloud cover, with low clouds penalized most.",
          transparency_score: "Visibility reduced by PM2.5, PM10, AQI, dust, and aerosol load.",
          darkness_score: "Astronomical darkness reduced by moonlight and site light pollution, using a provided or estimated bortle-like class.",
          dew_risk_score: "Higher is safer; lower values mean stronger lens condensation risk.",
          stability_score: "Heuristic for sharpness based on wind, gusts, humidity, and temperature swings.",
        },
        mode_presets: {
          general: "Balanced default for general astrophotography planning.",
          wide_field_milky_way: "Emphasizes darkness, transparency, and galactic-core usability for wide-band Milky Way work.",
          wide_field_nightscape: "Relaxes moon penalties and leans on cloud/stability for foreground-inclusive nightscape shooting.",
          broadband_deep_sky: "Emphasizes darkness, transparency, and target altitude for faint broadband targets.",
          narrowband_deep_sky: "Leans more on stability and target altitude while tolerating moonlight better than broadband.",
          star_trail: "Favors cloud-free long windows and stable long-session conditions over maximum darkness.",
        },
        derived_recommendations: {
          go_no_go: "Whether the night is worth heading out for general astrophotography.",
          best_window: "Best contiguous hourly window with viable scores.",
          mode_best_window: "Best contiguous hourly window for the selected shooting mode.",
          dew_heater_needed: "True when at least one hour has significant dew risk.",
          milky_way_ready: "True when at least one hour is dark enough and the galactic core is visible.",
          deep_sky_ready: "True when darkness, cloud, and stability are all good enough.",
          beginner_safe: "True when conditions are simple enough for first-time shooters.",
        },
        score_flow_fields: {
          score_curve: "Compact hourly curve for plotting overall and mode scores without reading the full raw hourly payload.",
          blocker_timeline: "Per-hour primary blocker such as cloud, moonlight, transparency, target altitude, or hard-fail weather.",
          window_rankings: "Top-ranked night windows for overall, active mode, Milky Way, and target-specific use cases.",
          curve_summary: "Simple trend summary such as improving, stable, or deteriorating across the night.",
        },
        detail_policy: {
          full: "Dates up to 5 days ahead can return full hourly score detail.",
          reduced: "More distant dates should use score_night_sky_outlook for coarse block-level planning.",
        },
        target_support: {
          target_input: "Optional target name or RA/Dec can be supplied to compute hourly target altitude and airmass context.",
          target_summary: "When target input exists, astronomy_context.target reports visible hours, peak altitude time, best altitude window, and moon separation context.",
        },
        interpretation_notes: [
          "Hard fail reasons such as precipitation and dense fog cap scores aggressively.",
          "A bright moon can leave cloud and transparency scores high while darkness remains poor.",
          "Site bortle class acts as a baseline darkness modifier and should be provided when known.",
          "AQI-related fields are included to improve transparency and comfort interpretation.",
          "Target/mode interpretation should consider Moon separation: deep-sky and Milky Way presets are more sensitive when separation is small.",
          "place_query can be used instead of coordinates when a Kakao Local REST API key is configured.",
          "When local Black Marble tiles are present, a continuous Bortle-like estimate is computed automatically and used as the default darkness baseline.",
        ],
      };

      return {
        content: [
          {
            type: "text",
            text: buildScoringModelToolContent(),
          },
        ],
        structuredContent: modelDescription,
      };
    },
  );

  return server;
}
