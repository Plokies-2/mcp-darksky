import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLightPollutionReport, getNightSkyScoreReport, scoreInputSchema } from "./service.js";

export function createDarkSkyServer({ publicBaseUrl = "http://localhost:3000", kakaoRestApiKey } = {}) {
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
    site_profile: z
      .object({
        bortle_class: z.number().int().min(1).max(9).optional(),
        elevation_m: z.number().min(-100).max(9000).optional(),
        near_water: z.boolean().optional(),
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
        "Read local NASA Black Marble annual tiles and return an estimated Bortle-like darkness class for a Korean location.",
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
    "score_night_sky_via_link",
    {
      title: "Get a shareable score link",
      description:
        "Return direct links for the same night-sky query as MCP, JSON API, and prompt-friendly fallback entrypoints.",
      inputSchema: scoreToolInputSchema,
    },
    async (input) => {
      const parsed = scoreInputSchema.parse(input);
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

      const links = {
        mcp_endpoint: `${publicBaseUrl}/mcp`,
        json_api_url: `${publicBaseUrl}/api/score?${params.toString()}`,
        prompt_url: `${publicBaseUrl}/prompt`,
        install_url: `${publicBaseUrl}/install`,
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
          cloud_score: "Weighted by low/mid/high cloud cover, with low clouds penalized most.",
          transparency_score: "Visibility reduced by PM2.5, PM10, AQI, dust, and aerosol load.",
          darkness_score: "Astronomical darkness reduced by moonlight and site light pollution, using a provided or estimated bortle-like class.",
          dew_risk_score: "Higher is safer; lower values mean stronger lens condensation risk.",
          stability_score: "Heuristic for sharpness based on wind, gusts, humidity, and temperature swings.",
        },
        derived_recommendations: {
          go_no_go: "Whether the night is worth heading out for general astrophotography.",
          best_window: "Best contiguous hourly window with viable scores.",
          dew_heater_needed: "True when at least one hour has significant dew risk.",
          milky_way_ready: "True when at least one hour is dark enough and the galactic core is visible.",
          deep_sky_ready: "True when darkness, cloud, and stability are all good enough.",
          beginner_safe: "True when conditions are simple enough for first-time shooters.",
        },
        interpretation_notes: [
          "Hard fail reasons such as precipitation and dense fog cap scores aggressively.",
          "A bright moon can leave cloud and transparency scores high while darkness remains poor.",
          "Site bortle class acts as a baseline darkness modifier and should be provided when known.",
          "AQI-related fields are included to improve transparency and comfort interpretation.",
          "place_query can be used instead of coordinates when a Kakao Local REST API key is configured.",
          "When local Black Marble tiles are present, a Bortle-like estimate is computed automatically and used as the default darkness baseline.",
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
