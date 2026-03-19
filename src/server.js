import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getLightPollutionMethodologyReport,
  getLightPollutionReport,
  getNightSkyOutlookReport,
  getNightSkyScoreReport,
  getForecastDetailPolicy,
  scoreInputSchema,
} from "./service.js";

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

  const scoreToolInputSchema = {
    latitude: z.number().min(33).max(39.5).optional().describe("Latitude in Korea-friendly range."),
    longitude: z.number().min(124).max(132).optional().describe("Longitude in Korea-friendly range."),
    place_query: z.string().min(2).optional().describe("Korean place name or address resolved through Kakao Local API."),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Local observation date in YYYY-MM-DD."),
    location_name: z.string().optional(),
    timezone: z.string().default("Asia/Seoul"),
    mode: scoreModeSchema.describe(
      "Scoring preset: general, wide_field_milky_way, wide_field_nightscape, broadband_deep_sky, narrowband_deep_sky, star_trail.",
    ),
    site_profile: z
      .object({
        bortle_class: z.number().int().min(1).max(9).optional(),
        elevation_m: z.number().min(-100).max(9000).optional(),
        near_water: z.boolean().optional(),
      })
      .optional(),
    target: z
      .object({
        name: z.string().min(2).optional().describe("Known target name such as 'Andromeda Galaxy', 'Orion Nebula', or 'Milky Way Core'."),
        ra_hours: z.number().min(0).max(24).optional().describe("Custom target right ascension in hours."),
        dec_degrees: z.number().min(-90).max(90).optional().describe("Custom target declination in degrees."),
        category: z.string().optional().describe("Optional target category label for display."),
      })
      .optional(),
  };

  server.registerTool(
    "score_night_sky",
    {
      title: "Score night sky conditions",
      description:
        "Fetch forecast and astronomy context for a Korean observation site, then return per-hour astrophotography scores and recommendations.",
      inputSchema: scoreToolInputSchema,
    },
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
            text: JSON.stringify(report, null, 2),
          },
        ],
        structuredContent: report,
      };
    },
  );

  const outlookToolInputSchema = {
    latitude: z.number().min(33).max(39.5).optional().describe("Latitude in Korea-friendly range."),
    longitude: z.number().min(124).max(132).optional().describe("Longitude in Korea-friendly range."),
    place_query: z.string().min(2).optional().describe("Korean place name or address resolved through Kakao Local API."),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Local observation date in YYYY-MM-DD."),
    location_name: z.string().optional(),
    timezone: z.string().default("Asia/Seoul"),
    mode: scoreModeSchema.describe(
      "Coarse outlook preset: general, wide_field_milky_way, wide_field_nightscape, broadband_deep_sky, narrowband_deep_sky, star_trail.",
    ),
    site_profile: z
      .object({
        bortle_class: z.number().int().min(1).max(9).optional(),
        elevation_m: z.number().min(-100).max(9000).optional(),
        near_water: z.boolean().optional(),
      })
      .optional(),
  };

  server.registerTool(
    "score_night_sky_outlook",
    {
      title: "Get a coarse night outlook",
      description:
        "Return a simplified night outlook for distant dates when full hourly score detail should be intentionally reduced.",
      inputSchema: outlookToolInputSchema,
    },
    async (input) => {
      const report = await getNightSkyOutlookReport({
        ...input,
        kakaoRestApiKey,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(report, null, 2),
          },
        ],
        structuredContent: report,
      };
    },
  );

  server.registerTool(
    "estimate_light_pollution",
    {
      title: "Estimate light pollution and Bortle-like class",
      description:
        "Read local NASA Black Marble annual tiles and return an estimated Bortle-like darkness center, uncertainty range, and equivalent zenith brightness proxy for a Korean location.",
      inputSchema: {
        latitude: z.number().min(33).max(39.5).optional().describe("Latitude in Korea-friendly range."),
        longitude: z.number().min(124).max(132).optional().describe("Longitude in Korea-friendly range."),
        place_query: z.string().min(2).optional().describe("Korean place name or address resolved through Kakao Local API."),
        location_name: z.string().optional(),
      },
    },
    async (input) => {
      const report = await getLightPollutionReport({
        ...input,
        kakaoRestApiKey,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(report, null, 2),
          },
        ],
        structuredContent: report,
      };
    },
  );

  server.registerTool(
    "describe_light_pollution_method",
    {
      title: "Describe the light-pollution estimation method",
      description:
        "Return the evidence sources, guardrails, and release checks for the estimated Bortle-like light-pollution method.",
      inputSchema: {},
    },
    async () => {
      const report = getLightPollutionMethodologyReport();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(report, null, 2),
          },
        ],
        structuredContent: report,
      };
    },
  );

  server.registerTool(
    "score_night_sky_via_link",
    {
      title: "Get a shareable score link",
      description:
        "Return direct links for the same night-sky query as MCP, JSON API, and prompt-friendly fallback entrypoints.",
      inputSchema: scoreToolInputSchema,
    },
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
            text: JSON.stringify(links, null, 2),
          },
        ],
        structuredContent: links,
      };
    },
  );

  server.registerTool(
    "describe_scoring_model",
    {
      title: "Describe scoring model",
      description:
        "Return a concise schema and interpretation guide for the night-sky scoring output so an attached AI can explain results well.",
      inputSchema: {},
    },
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
            text: JSON.stringify(modelDescription, null, 2),
          },
        ],
        structuredContent: modelDescription,
      };
    },
  );

  return server;
}
