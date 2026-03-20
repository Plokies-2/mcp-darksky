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

  assert.ok(widgetResource);
  assert.equal(typeof widgetResource.readCallback, "function");
  assert.equal(widgetResource.metadata?.mimeType, APP_WIDGET_MIME_TYPE);

  const response = await Promise.resolve(widgetResource.readCallback(new URL(APP_WIDGET_URI), {}));
  const widgetHtml = extractResourceText(response);

  assert.equal(typeof widgetHtml, "string");
  assert.match(widgetHtml, /widget-uri/);
});

test("MCP server registers a dynamic detail resource template", () => {
  const server = createDarkSkyServer({ publicBaseUrl: PUBLIC_BASE_URL });
  const templates = Object.values(server._registeredResourceTemplates ?? {});
  const detailTemplate = templates.find((item) => String(item?.resourceTemplate?.uriTemplate).includes("darksky://reports/{reportId}"));

  assert.ok(detailTemplate);
  assert.equal(typeof detailTemplate.readCallback, "function");
});

test("score-related tools expose ChatGPT Apps output metadata", () => {
  const server = createDarkSkyServer({ publicBaseUrl: PUBLIC_BASE_URL });
  const toolNames = ["score_night_sky", "score_night_sky_outlook", "estimate_light_pollution", "score_night_sky_via_link"];

  for (const name of toolNames) {
    const tool = server._registeredTools?.[name];
    const meta = tool?._meta;

    assert.ok(tool);
    assert.ok(meta && typeof meta === "object");
    assert.equal(extractWidgetResourceUri(meta), APP_WIDGET_URI);
  }
});

test("tool descriptions steer vague requests toward general mode and mention ambiguous night-time interpretation", () => {
  const server = createDarkSkyServer({ publicBaseUrl: PUBLIC_BASE_URL });
  const scoreDescription = server._registeredTools?.score_night_sky?.description ?? "";
  const outlookDescription = server._registeredTools?.score_night_sky_outlook?.description ?? "";

  assert.match(scoreDescription, /keep mode as general by default/i);
  assert.match(outlookDescription, /keep mode as general by default/i);
});

test("score-related tools expose compact descriptions and structured output schemas", () => {
  const server = createDarkSkyServer({ publicBaseUrl: PUBLIC_BASE_URL });
  const scoreTool = server._registeredTools?.score_night_sky;
  const outlookTool = server._registeredTools?.score_night_sky_outlook;
  const lightTool = server._registeredTools?.estimate_light_pollution;

  assert.ok(scoreTool?.outputSchema);
  assert.ok(outlookTool?.outputSchema);
  assert.ok(lightTool?.outputSchema);
  assert.ok((scoreTool?.description ?? "").length < 400);
  assert.ok((outlookTool?.description ?? "").length < 400);
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

test("score tool content uses best_window first and labels required considerations", () => {
  const content = buildScoreToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    scores: {
      active_mode: "wide_field_milky_way",
      cloud_score: 91,
      transparency_score: 67,
      darkness_score: 82,
      dew_risk_score: 40,
      stability_score: 52,
    },
    curve_summary: {
      overall_trend: "improving",
    },
    derived_recommendations: {
      mode_ready: true,
      best_window: {
        start: "2026-03-20T15:00:00Z",
        end: "2026-03-20T16:00:00Z",
      },
      mode_best_window: {
        start: "2026-03-20T12:00:00Z",
        end: "2026-03-20T18:00:00Z",
      },
    },
    light_pollution_context: {
      estimated_bortle_interval_label: "4.0-4.6",
    },
    request_context: {
      requested_mode: "general",
      resolved_mode: "wide_field_milky_way",
      resolution_reason: "shooting_goal_milky_way",
      shooting_goal: "은하수 광각 촬영",
      advanced_tip: "광각 은하수라면 코어가 더 높아지는 구간에 노출을 몰아주세요.",
    },
    blocker_timeline: [
      { primary_blocker: "moonlight" },
      { primary_blocker: "transparency" },
    ],
    hourly_conditions: [
      {
        time: "2026-03-20T15:00:00Z",
        mode_score: 73,
        primary_blocker: "transparency",
        dew_risk_score: 40,
        stability_score: 52,
        raw_inputs: {
          temperature_2m: 4,
          apparent_temperature: -1,
          dew_point_2m: 2,
          relative_humidity_2m: 93,
          precipitation: 0,
          visibility: 18000,
          european_aqi: 80,
          pm2_5: 38,
          pm10: 82,
          wind_speed_10m: 13,
          wind_gusts_10m: 31,
        },
        hard_fail_reasons: [],
      },
      {
        time: "2026-03-20T16:00:00Z",
        mode_score: 81,
        primary_blocker: null,
        dew_risk_score: 43,
        stability_score: 50,
        raw_inputs: {
          temperature_2m: 3,
          apparent_temperature: -2,
          dew_point_2m: 1,
          relative_humidity_2m: 94,
          precipitation: 0,
          visibility: 17000,
          european_aqi: 82,
          pm2_5: 40,
          pm10: 84,
          wind_speed_10m: 12,
          wind_gusts_10m: 33,
        },
        hard_fail_reasons: [],
      },
    ],
  });

  assert.match(content, /추천 시간: \*\*03\/21 00:00-01:00\*\*\./);
  assert.match(content, /조건 요약:/);
  assert.match(content, /광해등급:/);
  assert.match(content, /대기질:/);
  assert.match(content, /대상\/코어 고도:/);
  assert.match(content, /월령\/달 상태:/);
  assert.match(content, /시간대별 점수 추이:/);
  assert.match(content, /\| 03\/21 00:00 \| 73 \| 투명도 \|/);
  assert.match(content, /필수 고려사항:/);
  assert.match(content, /렌즈히터/);
  assert.match(content, /마스크/);
  assert.match(content, /핫팩/);
  assert.match(content, /삼각대/);
  assert.doesNotMatch(content, /필수 준비물/);
});

test("score tool content requires brief explanations for each factor", () => {
  const content = buildScoreToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    scores: {
      active_mode: "wide_field_milky_way",
      cloud_score: 91,
      transparency_score: 67,
      darkness_score: 82,
      dew_risk_score: 40,
      stability_score: 52,
    },
    derived_recommendations: {
      mode_ready: true,
      best_window: {
        start: "2026-03-20T15:00:00Z",
        end: "2026-03-20T16:00:00Z",
      },
    },
    light_pollution_context: {
      estimated_bortle_interval_label: "4.0-4.6",
    },
    request_context: {
      requested_mode: "general",
      resolved_mode: "wide_field_milky_way",
      resolution_reason: "shooting_goal_milky_way",
      shooting_goal: "milky way",
    },
    blocker_timeline: [
      { primary_blocker: "moonlight" },
    ],
    hourly_conditions: [
      {
        time: "2026-03-20T15:00:00Z",
        mode_score: 73,
        dew_risk_score: 40,
        stability_score: 52,
        raw_inputs: {
          temperature_2m: 4,
          apparent_temperature: -1,
          dew_point_2m: 2,
          relative_humidity_2m: 93,
          precipitation: 0,
          visibility: 18000,
          european_aqi: 80,
          pm2_5: 38,
          pm10: 82,
          wind_speed_10m: 13,
          wind_gusts_10m: 31,
        },
        hard_fail_reasons: [],
      },
    ],
  });

  assert.match(content, /For every item in 조건 요약, include a short interpretation of what that factor means for the shoot\./);
  assert.match(content, /In 이번 계산에 반영한 요소, do not only list factor names\./);
  assert.match(content, /- survey_factors: .*\(.*\)/);
});

test("score tool content surfaces urban reference score when available", () => {
  const content = buildScoreToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    scores: {
      active_mode: "broadband_deep_sky",
      mode_score: 44,
      reference_mode_score: 71,
      reference_mode_score_context: {
        label: "협대역/듀얼밴드 필터 기준 참고 점수",
        mode: "narrowband_deep_sky",
        mode_label: "Narrowband Deep-sky",
        mode_ready: true,
        threshold_bortle_class: 7,
      },
      cloud_score: 91,
      transparency_score: 67,
      darkness_score: 38,
      dew_risk_score: 55,
      stability_score: 64,
    },
    derived_recommendations: {
      mode_ready: false,
      best_window: {
        start: "2026-03-20T15:00:00Z",
        end: "2026-03-20T16:00:00Z",
      },
    },
    request_context: {
      requested_mode: "broadband_deep_sky",
      resolved_mode: "broadband_deep_sky",
      resolution_reason: "explicit_mode",
    },
    blocker_timeline: [
      { primary_blocker: "light_pollution" },
    ],
    hourly_conditions: [
      {
        time: "2026-03-20T15:00:00Z",
        mode_score: 44,
        reference_mode_score: 71,
        primary_blocker: "light_pollution",
        raw_inputs: {},
        hard_fail_reasons: [],
      },
    ],
  });

  assert.match(content, /urban_reference:/);
  assert.match(content, /44 \/ 71/);
});

test("score tool content still includes factor explanations when no best window exists", () => {
  const content = buildScoreToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    scores: {
      active_mode: "wide_field_milky_way",
      cloud_score: 70,
      transparency_score: 50,
      darkness_score: 60,
      dew_risk_score: 90,
      stability_score: 80,
    },
    derived_recommendations: {
      mode_ready: false,
      best_window: null,
      best_windows: null,
      mode_best_window: null,
      mode_best_windows: null,
    },
    light_pollution_context: {
      estimated_bortle_interval_label: "3.0-4.6",
    },
    request_context: {
      requested_mode: "general",
      resolved_mode: "wide_field_milky_way",
      resolution_reason: "shooting_goal_milky_way",
      shooting_goal: "milky way",
    },
    astronomy_context: {
      moon_interference_hours: 2,
    },
    blocker_timeline: [
      { primary_blocker: "target_altitude" },
    ],
    hourly_conditions: [
      {
        time: "2026-03-20T15:00:00Z",
        mode_score: 25,
        cloud_score: 70,
        transparency_score: 50,
        dew_risk_score: 90,
        stability_score: 80,
        moon_context: {
          visible: false,
          illumination_fraction: 0.1,
        },
        raw_inputs: {
          temperature_2m: 2,
          apparent_temperature: -1,
          dew_point_2m: -3,
          relative_humidity_2m: 70,
          precipitation: 0,
          visibility: 18000,
          european_aqi: 55,
          pm2_5: 20,
          pm10: 35,
          galactic_core_altitude_degrees: -20,
          galactic_core_moon_separation_degrees: 30,
        },
        hard_fail_reasons: [],
      },
    ],
  });

  assert.match(content, /조건 요약:/);
  assert.match(content, /- survey_factors: .*\(.*\)/);
});

test("score tool content uses blocker_timeline for 핵심 변수 when hourly rows omit it", () => {
  const content = buildScoreToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    scores: {
      active_mode: "wide_field_milky_way",
      cloud_score: 90,
      transparency_score: 70,
      darkness_score: 80,
      dew_risk_score: 70,
      stability_score: 70,
    },
    derived_recommendations: {
      mode_ready: true,
      best_window: {
        start: "2026-03-20T15:00:00Z",
        end: "2026-03-20T16:00:00Z",
      },
    },
    request_context: {
      requested_mode: "general",
      resolved_mode: "wide_field_milky_way",
      resolution_reason: "shooting_goal_milky_way",
      shooting_goal: "은하수 광각 촬영",
      advanced_tip: "광각 은하수라면 코어가 더 높아지는 구간에 노출을 몰아주세요.",
    },
    blocker_timeline: [
      { time: "2026-03-20T15:00:00Z", primary_blocker: "moonlight" },
      { time: "2026-03-20T16:00:00Z", primary_blocker: "transparency" },
    ],
    hourly_conditions: [
      { time: "2026-03-20T15:00:00Z", mode_score: 62, hard_fail_reasons: [], raw_inputs: {} },
      { time: "2026-03-20T16:00:00Z", mode_score: 76, hard_fail_reasons: [], raw_inputs: {} },
    ],
  });

  assert.match(content, /\| 03\/21 00:00 \| 62 \| .*달빛/);
  assert.match(content, /\| 03\/21 01:00 \| 76 \| .*투명도/);
});

test("score tool content formats split best windows and single-hour windows compactly", () => {
  const content = buildScoreToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    scores: {
      active_mode: "wide_field_milky_way",
      cloud_score: 88,
      transparency_score: 72,
      darkness_score: 84,
      dew_risk_score: 78,
      stability_score: 70,
    },
    derived_recommendations: {
      mode_ready: true,
      best_window: {
        start: "2026-03-20T15:00:00Z",
        end: "2026-03-20T15:00:00Z",
      },
      best_windows: [
        {
          start: "2026-03-20T15:00:00Z",
          end: "2026-03-20T15:00:00Z",
        },
        {
          start: "2026-03-20T17:00:00Z",
          end: "2026-03-20T18:00:00Z",
        },
      ],
    },
    request_context: {
      requested_mode: "general",
      resolved_mode: "wide_field_milky_way",
      resolution_reason: "shooting_goal_milky_way",
      shooting_goal: "milky way",
    },
    blocker_timeline: [
      { time: "2026-03-20T15:00:00Z", primary_blocker: "moonlight" },
      { time: "2026-03-20T17:00:00Z", primary_blocker: "transparency" },
      { time: "2026-03-20T18:00:00Z", primary_blocker: "transparency" },
    ],
    hourly_conditions: [
      { time: "2026-03-20T15:00:00Z", mode_score: 81, hard_fail_reasons: [], raw_inputs: {} },
      { time: "2026-03-20T17:00:00Z", mode_score: 81, hard_fail_reasons: [], raw_inputs: {} },
      { time: "2026-03-20T18:00:00Z", mode_score: 81, hard_fail_reasons: [], raw_inputs: {} },
    ],
  });

  assert.match(content, /추천 시간: \*\*03\/21 00:00 \/ 03\/21 02:00-03:00\*\*\./);
  assert.doesNotMatch(content, /03\/21 00:00-00:00/);
});

test("general outlook content explicitly keeps the answer mode-neutral", () => {
  const content = buildOutlookToolContent({
    location: {
      timezone: "Asia/Seoul",
    },
    summary: {
      mode_ready: true,
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
    },
    outlook_blocks: [
      { start: "2026-03-20T10:00:00Z", end: "2026-03-20T13:00:00Z", average_mode_score: 71, primary_blocker: "moonlight" },
    ],
  });

  assert.match(content, /keep the answer mode-neutral and planning-focused/);
  assert.match(content, /names the shooting theme more precisely/);
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

  assert.match(content, /score_night_sky_outlook/);
  assert.match(content, /recommended_mode: general/);
});
