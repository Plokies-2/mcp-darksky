import test from "node:test";
import assert from "node:assert/strict";
import { APP_WIDGET_MIME_TYPE, APP_WIDGET_URI, buildAppWidgetPage } from "../src/app-widget.js";
import { buildOutlookToolContent, buildScoreToolContent, createDarkSkyServer } from "../src/server.js";

const PUBLIC_BASE_URL = "https://darksky.example.com";

function extractResourceText(response) {
  if (typeof response === "string") {
    return response;
  }

  if (response && typeof response === "object") {
    if (typeof response.text === "string") {
      return response.text;
    }

    if (Array.isArray(response.contents) && response.contents[0] && typeof response.contents[0].text === "string") {
      return response.contents[0].text;
    }
  }

  return undefined;
}

function extractWidgetResourceUri(meta) {
  if (!meta || typeof meta !== "object") {
    return undefined;
  }

  const fromUi = meta.ui?.resourceUri || meta["ui.resourceUri"] || meta.ui?.uri;
  if (fromUi) {
    return String(fromUi);
  }

  const outputTemplate = meta["openai/outputTemplate"];
  if (typeof outputTemplate === "string") {
    return outputTemplate;
  }

  if (outputTemplate && typeof outputTemplate === "object") {
    return outputTemplate.resourceUri || outputTemplate.uri || outputTemplate.url;
  }

  return undefined;
}

test("buildAppWidgetPage emits MCP App page contract", () => {
  const html = buildAppWidgetPage();
  const custom = buildAppWidgetPage({
    title: "Test Widget",
    widgetUri: "ui://widget/custom.html",
    widgetMimeType: "text/html;profile=mcp-app-custom",
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, new RegExp(`<meta name="widget-uri"[^>]*content="${APP_WIDGET_URI.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, new RegExp(`<meta name="widget-mime-type"[^>]*content="${APP_WIDGET_MIME_TYPE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, /function renderFromPayload/);
  assert.match(html, /window\.openai/);

  assert.match(custom, /Test Widget/);
  assert.match(custom, /ui:\/\/widget\/custom\.html/);
  assert.match(custom, /text\/html;profile=mcp-app-custom/);
});

test("MCP server registers the App widget as a resource", async () => {
  const server = createDarkSkyServer({ publicBaseUrl: PUBLIC_BASE_URL });
  const widgetResource = server._registeredResources?.[APP_WIDGET_URI];

  assert.ok(widgetResource, `Expected resource ${APP_WIDGET_URI} to be registered for ChatGPT Apps`);
  assert.equal(typeof widgetResource.readCallback, "function");
  assert.equal(widgetResource.metadata?.mimeType, APP_WIDGET_MIME_TYPE);

  const response = await Promise.resolve(widgetResource.readCallback(new URL(APP_WIDGET_URI), {}));
  const widgetHtml = extractResourceText(response);

  assert.equal(typeof widgetHtml, "string");
  assert.match(widgetHtml, new RegExp(APP_WIDGET_URI.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(widgetHtml, /widget-uri/);
});

test("score-related tools expose ChatGPT Apps output metadata", () => {
  const server = createDarkSkyServer({ publicBaseUrl: PUBLIC_BASE_URL });
  const toolNames = ["score_night_sky", "score_night_sky_outlook", "estimate_light_pollution", "score_night_sky_via_link"];

  for (const name of toolNames) {
    const tool = server._registeredTools?.[name];
    const meta = tool?._meta;

    assert.ok(tool, `Expected tool ${name} to be registered`);
    assert.ok(meta && typeof meta === "object", `Expected ${name} to include _meta`);
    assert.equal(extractWidgetResourceUri(meta), APP_WIDGET_URI);
  }
});

test("score and outlook tool descriptions steer non-explicit target requests toward general mode", () => {
  const server = createDarkSkyServer({ publicBaseUrl: PUBLIC_BASE_URL });
  const scoreDescription = server._registeredTools?.score_night_sky?.description ?? "";
  const outlookDescription = server._registeredTools?.score_night_sky_outlook?.description ?? "";
  const scoreGoalDoc = server._registeredTools?.score_night_sky?.inputSchema?.shape?.shooting_goal?.description ?? "";
  const outlookGoalDoc = server._registeredTools?.score_night_sky_outlook?.inputSchema?.shape?.shooting_goal?.description ?? "";

  assert.match(scoreDescription, /did not explicitly name a celestial target/i);
  assert.match(scoreDescription, /keep mode as general by default/i);
  assert.match(outlookDescription, /did not explicitly name a celestial target/i);
  assert.match(outlookDescription, /keep mode as general by default/i);
  assert.match(scoreGoalDoc, /If no celestial target is explicitly stated, keep mode as general by default/i);
  assert.match(outlookGoalDoc, /If no celestial target is explicitly stated, keep mode as general by default/i);
});

test("score-related tool schemas reject unsupported extra fields", () => {
  const server = createDarkSkyServer({ publicBaseUrl: PUBLIC_BASE_URL });
  const scoreSchema = server._registeredTools?.score_night_sky?.inputSchema;
  const outlookSchema = server._registeredTools?.score_night_sky_outlook?.inputSchema;

  assert.throws(() => scoreSchema.parse({
    place_query: "안반데기",
    date: "2026-03-20",
    latitude: 37.62,
  }));
  assert.throws(() => outlookSchema.parse({
    place_query: "안반데기",
    date: "2026-03-28",
    target: {
      name: "Andromeda Galaxy",
      ra_hours: 0.71,
    },
  }));
});

test("score tool content nudges a compact structured Korean answer", () => {
  const content = buildScoreToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    scores: {
      active_mode: "wide_field_milky_way",
      cloud_score: 91,
      transparency_score: 67,
      darkness_score: 82,
      dew_risk_score: 88,
      stability_score: 63,
    },
    curve_summary: {
      overall_trend: "improving",
    },
    derived_recommendations: {
      go_no_go: "go",
      best_window: {
        start: "2026-03-20T12:00:00Z",
        end: "2026-03-20T18:00:00Z",
      },
      dew_heater_needed: true,
      milky_way_ready: true,
      deep_sky_ready: false,
    },
    light_pollution_context: {
      estimated_bortle_interval_label: "4.0-4.6",
    },
    request_context: {
      requested_mode: "general",
      resolved_mode: "wide_field_milky_way",
      resolution_reason: "shooting_goal_milky_way",
      shooting_goal: "은하수 광각 촬영",
      advanced_tip: "광각 광대역 촬영이라면 달빛과 투명도를 먼저 보고, 바람은 그다음 변수로 보세요",
    },
    blocker_timeline: [
      { primary_blocker: "moonlight" },
      { primary_blocker: "moonlight" },
      { primary_blocker: "transparency" },
    ],
    hourly_conditions: [
      { time: "2026-03-20T10:00:00Z", mode_score: 56, primary_blocker: "moonlight" },
      { time: "2026-03-20T12:00:00Z", mode_score: 68, primary_blocker: "transparency" },
      { time: "2026-03-20T14:00:00Z", mode_score: 81, primary_blocker: null },
    ],
  });

  assert.match(content, /추천 시간: \*\*03\/20 21:00-03\/21 03:00\*\*\./);
  assert.match(content, /판단 이유:/);
  assert.match(content, /은하수 고도, 달빛, 구름과 투명도/);
  assert.match(content, /03\/20 21:00-03\/21 03:00를 반드시 비교하기/);
  assert.match(content, /시간대별 점수 추이:/);
  assert.match(content, /\| 시간대 \| 점수 \| 핵심 변수 \|/);
  assert.match(content, /\| 03\/20 19:00 \| 56 \| 달빛 \|/);
  assert.match(content, /\| 03\/20 23:00 \| 81 \| - \|/);
  assert.match(content, /이번 계산에 반영한 요소: 월령\/달고도, 구름량, 투명도, 어둠, 이슬점 spread\/결로 위험, 바람\/안정도, 광해, 은하수 코어 가시성\./);
  assert.match(content, /필수 준비물: 렌즈히터 또는 결로 대비 장비\./);
  assert.match(content, /숙련자 참고: 광각 광대역 촬영이라면 달빛과 투명도를 먼저 보고, 바람은 그다음 변수로 보세요\./);
  assert.match(content, /purpose_fit: 광시야 은하수/);
  assert.match(content, /reason_focus: 은하수 고도, 달빛, 구름과 투명도/);
  assert.match(content, /survey_factors: 월령\/달고도, 구름량, 투명도, 어둠, 이슬점 spread\/결로 위험, 바람\/안정도, 광해, 은하수 코어 가시성/);
  assert.match(content, /requested_mode: general/);
  assert.match(content, /resolved_mode: wide_field_milky_way/);
  assert.match(content, /shooting_goal: 은하수 광각 촬영/);
  assert.match(content, /operator_tip: 광각 광대역 촬영이라면 달빛과 투명도를 먼저 보고, 바람은 그다음 변수로 보세요/);
  assert.match(content, /timing_hint: 이른 시간보다 뒤 시간이 더 유리한 흐름/);
  assert.match(content, /secondary_factors: 구름 좋음, 투명도 보통, 어둠 좋음, 이슬위험 낮음, 안정도 보통, 광해 4.0-4.6/);
});

test("outlook tool content uses the same compact labeled shape", () => {
  const content = buildOutlookToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    summary: {
      go_no_go_outlook: "no_go",
      active_mode: "broadband_deep_sky",
      overall_outlook_score: 42,
      best_block: {
        start: "2026-03-20T09:00:00Z",
        end: "2026-03-20T12:00:00Z",
      },
    },
    astronomy_context: {
      target: {
        name: "Andromeda Galaxy",
      },
    },
    request_context: {
      requested_mode: "general",
      resolved_mode: "broadband_deep_sky",
      resolution_reason: "shooting_goal_deep_sky",
      shooting_goal: "안드로메다 광대역 딥스카이",
      advanced_tip: "광대역 기준이라면 달빛과 투명도를 더 엄격하게 보고 판단하세요",
    },
    outlook_blocks: [
      {
        start: "2026-03-20T09:00:00Z",
        end: "2026-03-20T12:00:00Z",
        average_mode_score: 42,
        primary_blocker: "cloud",
      },
      {
        start: "2026-03-20T12:00:00Z",
        end: "2026-03-20T15:00:00Z",
        average_mode_score: 35,
        primary_blocker: "moonlight",
      },
    ],
  });

  assert.match(content, /추천 시간: \*\*03\/20 18:00-21:00\*\*\./);
  assert.match(content, /판단 이유:/);
  assert.match(content, /Andromeda Galaxy 고도, 달빛, 투명도/);
  assert.match(content, /03\/20 18:00-21:00을 반드시 비교하기/);
  assert.match(content, /시간대별 전망 추이:/);
  assert.match(content, /\| 시간대 \| 점수 \| 핵심 변수 \|/);
  assert.match(content, /\| 03\/20 18:00-21:00 \| 42 \| 구름 \|/);
  assert.match(content, /이번 계산에 반영한 요소: 월령\/달고도, 구름량, 투명도, 어둠, 이슬점 spread\/결로 위험, 바람\/안정도, 광해, 타깃 고도\./);
  assert.match(content, /숙련자 참고: 광대역 기준이라면 달빛과 투명도를 더 엄격하게 보고 판단하세요\./);
  assert.match(content, /purpose_fit: 광대역 딥스카이 \/ Andromeda Galaxy/);
  assert.match(content, /reason_focus: Andromeda Galaxy 고도, 달빛, 투명도/);
  assert.match(content, /resolved_mode: broadband_deep_sky/);
});

test("general outlook content explicitly keeps the answer mode-neutral", () => {
  const content = buildOutlookToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    summary: {
      go_no_go_outlook: "go",
      active_mode: "general",
      overall_outlook_score: 71,
      best_block: {
        start: "2026-03-20T10:00:00Z",
        end: "2026-03-20T13:00:00Z",
      },
    },
    request_context: {
      requested_mode: "general",
      resolved_mode: "general",
      resolution_reason: "default_general",
      shooting_goal: null,
      ignored_target_name: "육백마지기 하늘",
    },
    outlook_blocks: [
      { primary_blocker: "moonlight" },
    ],
  });

  assert.match(content, /keep the answer mode-neutral and planning-focused/);
  assert.match(content, /Do not turn a general outlook into Milky Way, deep-sky, target-altitude, or filter-specific advice/);
  assert.match(content, /must explicitly say that if the user names the shooting theme more precisely/);
  assert.match(content, /숙련자 참고: 지금은 일반 모드의 균형형 판단입니다\. 찍고 싶은 테마를 은하수, 별궤적, 광대역\/협대역 딥스카이처럼 정확히 말해주면 그 기준으로 다시 볼 수 있습니다\./);
  assert.match(content, /ignored_target_name/);
});

test("score tool content gives a dedicated fallback briefing for distant dates", () => {
  const content = buildScoreToolContent({
    report_kind: "fallback_required",
    recommended_tool: "score_night_sky_outlook",
    recommended_input: {
      date: "2026-03-28",
      mode: "general",
    },
    detail_policy: {
      requested_date: "2026-03-28",
    },
  });

  assert.match(content, /핵심 변수: 이 날짜는 세부 hourly score 범위를 넘어가는 날짜임\./);
  assert.match(content, /결론: 상세 점수보다 outlook으로 보는 편이 맞음\./);
  assert.match(content, /추천 시간: score_night_sky_outlook로 다시 조회\./);
  assert.match(content, /recommended_mode: general/);
});
