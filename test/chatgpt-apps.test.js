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
  });

  assert.match(content, /핵심 변수: 달빛, 투명도\./);
  assert.match(content, /결론: 가도 됨\./);
  assert.match(content, /요청 시점:/);
  assert.match(content, /간략히 비교해 답하기/);
  assert.match(content, /기타 변수: 구름 좋음, 투명도 보통, 어둠 좋음, 이슬위험 낮음, 안정도 보통, 광해 4.0-4.6\./);
  assert.match(content, /추가 팁: 광각 광대역 촬영이라면 달빛과 투명도를 먼저 보고, 바람은 그다음 변수로 보세요\./);
  assert.match(content, /추천 시간: 03\/20 21:00-03\/21 03:00\./);
  assert.match(content, /purpose_fit: 광시야 은하수/);
  assert.match(content, /requested_mode: general/);
  assert.match(content, /resolved_mode: wide_field_milky_way/);
  assert.match(content, /shooting_goal: 은하수 광각 촬영/);
  assert.match(content, /optional_advanced_tip: 광각 광대역 촬영이라면 달빛과 투명도를 먼저 보고, 바람은 그다음 변수로 보세요/);
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
      { primary_blocker: "cloud" },
      { primary_blocker: "moonlight" },
    ],
  });

  assert.match(content, /핵심 변수: 구름\./);
  assert.match(content, /결론: 비추천\./);
  assert.match(content, /요청 시점:/);
  assert.match(content, /간략히 비교해 답하기/);
  assert.match(content, /기타 변수: 구름, 투명도, 달 영향, 안정도를 짧게 한 줄로 묶어 말하기\./);
  assert.match(content, /추가 팁: 광대역 기준이라면 달빛과 투명도를 더 엄격하게 보고 판단하세요\./);
  assert.match(content, /추천 시간: 03\/20 18:00-21:00\./);
  assert.match(content, /purpose_fit: 광대역 딥스카이 \/ Andromeda Galaxy/);
  assert.match(content, /resolved_mode: broadband_deep_sky/);
});
