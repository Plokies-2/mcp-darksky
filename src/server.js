import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { APP_WIDGET_MIME_TYPE, APP_WIDGET_URI, buildAppWidgetPage } from "./app-widget.js";
import {
  getCachedLightPollutionReport,
  getCachedNightSkyOutlookReport,
  getCachedNightSkyScoreReport,
} from "./cached-reports.js";
import {
  getLightPollutionMethodologyReport,
  getForecastDetailPolicy,
} from "./service.js";
import {
  buildLinksToolContent,
  buildLightPollutionToolContent,
  buildMethodologyToolContent,
  buildOutlookToolContent,
  buildScoreToolContent,
  buildScoringModelToolContent,
} from "./tool-content.js";
import {
  publishDetailedReport,
  readDetailedReportResource,
  summarizeLightPollutionReport,
  summarizeOutlookReport,
  summarizeScoreReport,
} from "./report-resources.js";

export { buildOutlookToolContent, buildScoreToolContent } from "./tool-content.js";

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
  outputSchema,
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
    outputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint,
    },
    _meta: meta,
  };
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

  server.registerResource(
    "darksky-report-detail",
    new ResourceTemplate("darksky://reports/{reportId}", {}),
    {
      title: "Detailed dark-sky report",
      description: "Detailed JSON payload for a previously returned dark-sky report.",
      mimeType: "application/json",
    },
    async (_uri, variables) => {
      const reportIdValue = variables?.reportId;
      const reportId = Array.isArray(reportIdValue) ? reportIdValue[0] : reportIdValue;
      const resource = reportId ? readDetailedReportResource(reportId) : null;

      if (!resource) {
        return {
          contents: [
            {
              uri: `darksky://reports/${reportId ?? "missing"}`,
              mimeType: "application/json",
              text: JSON.stringify({
                error: "report_detail_not_found",
                message: "This detail resource is unavailable or expired.",
              }, null, 2),
            },
          ],
        };
      }

      return resource;
    },
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

  const locationOutputSchema = z.object({
    name: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).passthrough();

  const scoreToolOutputSchema = z.object({
    report_kind: z.string().optional(),
    location: locationOutputSchema.optional(),
    scores: z.object({
      overall_score: z.number().nullable().optional(),
      mode_score: z.number().nullable().optional(),
      reference_mode_score: z.number().nullable().optional(),
      active_mode: z.string().optional(),
    }).passthrough().optional(),
    derived_recommendations: z.object({
      mode_ready: z.boolean().optional(),
      best_window: z.any().optional(),
      mode_best_window: z.any().optional(),
    }).passthrough().optional(),
    request_context: z.object({
      requested_mode: z.string().optional(),
      resolved_mode: z.string().optional(),
      resolution_reason: z.string().optional(),
    }).passthrough().optional(),
  }).passthrough();

  const outlookToolOutputSchema = z.object({
    report_kind: z.string().optional(),
    location: locationOutputSchema.optional(),
    summary: z.object({
      overall_outlook_score: z.number().nullable().optional(),
      mode_outlook_score: z.number().nullable().optional(),
      active_mode: z.string().optional(),
      mode_ready: z.boolean().optional(),
    }).passthrough().optional(),
    request_context: z.object({
      requested_mode: z.string().optional(),
      resolved_mode: z.string().optional(),
      resolution_reason: z.string().optional(),
    }).passthrough().optional(),
  }).passthrough();

  const lightPollutionOutputSchema = z.object({
    location: locationOutputSchema.optional(),
    light_pollution_context: z.object({
      estimated_bortle_interval_label: z.string().optional(),
      target_display_bortle_center: z.number().nullable().optional(),
      unavailable: z.boolean().optional(),
    }).passthrough().optional(),
  }).passthrough();

  const linksOutputSchema = z.object({
    mcp_endpoint: z.string().url(),
    json_api_url: z.string().url(),
    json_outlook_api_url: z.string().url(),
    prompt_url: z.string().url(),
    install_url: z.string().url(),
    recommended_tool: z.string(),
  }).passthrough();

  const looseObjectOutputSchema = z.object({}).passthrough();

  server.registerTool(
    "score_night_sky",
    buildReadOnlyToolConfig({
      title: "Score night sky conditions",
      description:
        "Detailed night-sky scoring for Korean observing sites, usually within about 5 days. If no celestial target is explicit, keep mode as general by default. Use the user's raw place_query, optional shooting_goal, and an explicit target name only when the user named one.",
      inputSchema: scoreToolInputSchema,
      outputSchema: scoreToolOutputSchema,
      invoking: "Scoring sky conditions",
      invoked: "Sky score ready",
      openWorldHint: true,
      withWidget: true,
    }),
    async (input) => {
      const { report } = await getCachedNightSkyScoreReport({
        ...input,
        kakaoRestApiKey,
        publicBaseUrl,
      });
      const { uri, resourceLink } = publishDetailedReport("score", report);
      const summary = summarizeScoreReport(report, uri);

      return {
        content: [
          {
            type: "text",
            text: buildScoreToolContent(report),
          },
          resourceLink,
        ],
        structuredContent: summary,
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
        "Coarse block-level planning for more distant dates or quick comparison. If no celestial target is explicit, keep mode as general by default. Use the user's raw place_query, optional shooting_goal, and an explicit target name only when the user named one.",
      inputSchema: outlookToolInputSchema,
      outputSchema: outlookToolOutputSchema,
      invoking: "Building night outlook",
      invoked: "Night outlook ready",
      openWorldHint: true,
      withWidget: true,
    }),
    async (input) => {
      const { report } = await getCachedNightSkyOutlookReport({
        ...input,
        kakaoRestApiKey,
      });
      const { uri, resourceLink } = publishDetailedReport("outlook", report);
      const summary = summarizeOutlookReport(report, uri);

      return {
        content: [
          {
            type: "text",
            text: buildOutlookToolContent(report),
          },
          resourceLink,
        ],
        structuredContent: summary,
      };
    },
  );

  server.registerTool(
    "estimate_light_pollution",
    buildReadOnlyToolConfig({
      title: "Estimate light pollution and Bortle-like class",
      description:
        "Estimate the local light-pollution baseline and Bortle-like class for a Korean location.",
      inputSchema: z.object({
        place_query: z.string().min(2).optional().describe("Korean place name or address resolved through Kakao Local API."),
        location_name: z.string().optional(),
      }).strict(),
      outputSchema: lightPollutionOutputSchema,
      invoking: "Estimating light pollution",
      invoked: "Light estimate ready",
      openWorldHint: true,
      withWidget: true,
    }),
    async (input) => {
      const { report } = await getCachedLightPollutionReport({
        ...input,
        kakaoRestApiKey,
      });
      const { uri, resourceLink } = publishDetailedReport("light-pollution", report);
      const summary = summarizeLightPollutionReport(report, uri);

      return {
        content: [
          {
            type: "text",
            text: buildLightPollutionToolContent(report),
          },
          resourceLink,
        ],
        structuredContent: summary,
      };
    },
  );

  server.registerTool(
    "describe_light_pollution_method",
    buildReadOnlyToolConfig({
      title: "Describe the light-pollution estimation method",
      description:
        "Explain the methodology, guardrails, and benchmark notes behind the light-pollution estimate.",
      inputSchema: {},
      outputSchema: looseObjectOutputSchema,
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
        "Build reusable MCP, JSON API, and prompt links for the same query.",
      inputSchema: scoreToolInputSchema,
      outputSchema: linksOutputSchema,
      invoking: "Building share links",
      invoked: "Share links ready",
      withWidget: true,
    }),
    async (input) => {
      const parsed = scoreToolInputSchema.parse(input);
      const detailPolicy = getForecastDetailPolicy(parsed.date, parsed.timezone);
      const params = new URLSearchParams({
        date: parsed.date,
        timezone: parsed.timezone,
      });

      if (parsed.place_query) {
        params.set("place_query", parsed.place_query);
      }

      if (parsed.location_name) {
        params.set("location_name", parsed.location_name);
      }
      if (parsed.shooting_goal) {
        params.set("shooting_goal", parsed.shooting_goal);
      }
      if (parsed.mode && parsed.mode !== "general") {
        params.set("mode", parsed.mode);
      }
      if (parsed.target?.name) {
        params.set("target_name", parsed.target.name);
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
        "Explain the score fields, derived recommendations, and timing outputs.",
      inputSchema: {},
      outputSchema: looseObjectOutputSchema,
      invoking: "Loading scoring guide",
      invoked: "Scoring guide ready",
    }),
    async () => {
      const modelDescription = {
        scores: {
          overall_score: "0-100 combined suitability for night sky photography.",
          mode_score: "0-100 suitability for the selected shooting mode.",
          reference_mode_score: "Optional urban fallback reference score when a specialized setup such as narrowband can realistically mitigate light pollution for the active request.",
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
          mode_ready: "Primary mode-specific verdict. True when at least one hour is actually shootable for the active mode.",
          best_window: "Primary highest-scoring hour or tied hourly range for the selected night.",
          best_windows: "All highest-scoring tied hourly ranges when multiple peaks exist.",
          mode_best_window: "Primary highest-scoring hour or tied hourly range for the selected shooting mode.",
          mode_best_windows: "All highest-scoring tied hourly ranges for the selected shooting mode.",
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
