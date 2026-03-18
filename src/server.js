import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchForecastBundle } from "./open-meteo.js";
import { generateNightSkyReport } from "./scoring.js";

export function createDarkSkyServer() {
  const server = new McpServer({
    name: "mcp-darksky",
    version: "0.2.0",
  });

  const scoreInputSchema = {
    latitude: z.number().min(33).max(39.5).describe("Latitude in Korea-friendly range."),
    longitude: z.number().min(124).max(132).describe("Longitude in Korea-friendly range."),
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
      inputSchema: scoreInputSchema,
    },
    async ({ latitude, longitude, date, location_name, timezone, site_profile }) => {
      const nextDate = new Date(`${date}T00:00:00Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const endDate = nextDate.toISOString().slice(0, 10);

      const forecastBundle = await fetchForecastBundle({
        latitude,
        longitude,
        startDate: date,
        endDate,
        timezone,
      });

      const report = generateNightSkyReport({
        latitude,
        longitude,
        date,
        timezone: forecastBundle.timezone,
        locationName: location_name,
        hourlyForecast: forecastBundle.hourly,
        sourceAttribution: forecastBundle.sourceAttribution,
        siteProfile: {
          bortleClass: site_profile?.bortle_class,
          elevationM: site_profile?.elevation_m,
          nearWater: site_profile?.near_water,
        },
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
          transparency_score: "Visibility reduced by PM2.5, PM10, dust, and aerosol load.",
          darkness_score: "Astronomical darkness reduced by moonlight and site light pollution.",
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
