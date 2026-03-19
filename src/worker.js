import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createDarkSkyServer } from "./server.js";
import {
  buildPromptPage,
  buildPromptText,
  getLightPollutionReport,
  getNightSkyScoreReport,
  parseLightPollutionQuery,
  parseScoreQuery,
} from "./service.js";
import { buildHomePage, buildInstallPage } from "./web-ui.js";

const app = new Hono();
const SCORE_CACHE_TTL_SECONDS = 15 * 60;

app.use("*", async (c, next) => {
  const origin = c.env?.CORS_ORIGIN ?? "*";
  return cors({
    origin,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "mcp-session-id", "Last-Event-ID", "mcp-protocol-version"],
    exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
  })(c, next);
});

function getPublicBaseUrl(requestUrl, env) {
  if (env?.PUBLIC_BASE_URL) {
    return env.PUBLIC_BASE_URL;
  }
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

function getKakaoRestApiKey(env) {
  return env?.KAKAO_REST_API_KEY ?? env?.REST_API_KEY;
}

app.get("/health", (c) => c.json({
  ok: true,
  service: "mcp-darksky",
  runtime: "cloudflare-workers",
  transport: "web-standard-streamable-http",
}));

app.get("/", (c) => c.html(buildHomePage({ publicBaseUrl: getPublicBaseUrl(c.req.url, c.env) })));
app.get("/install", (c) => c.html(buildInstallPage({ publicBaseUrl: getPublicBaseUrl(c.req.url, c.env) })));
app.get("/prompt", (c) => c.html(buildPromptPage({ publicBaseUrl: getPublicBaseUrl(c.req.url, c.env) })));
app.get("/prompt.txt", (c) => c.text(buildPromptText({ publicBaseUrl: getPublicBaseUrl(c.req.url, c.env) })));

app.get("/api/score", async (c) => {
  const cache = caches.default;
  const cacheKey = new Request(c.req.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  try {
    const input = parseScoreQuery(c.req.query());
    const report = await getNightSkyScoreReport({
      ...input,
      kakaoRestApiKey: getKakaoRestApiKey(c.env),
    });
    const response = c.json(report);
    response.headers.set("Cache-Control", `public, max-age=0, s-maxage=${SCORE_CACHE_TTL_SECONDS}`);
    response.headers.set("X-Cache", "MISS");
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    if (error?.name === "ZodError") {
      return c.json({ error: "Invalid query parameters", details: error.issues }, 400);
    }
    if (error instanceof RangeError) {
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof Error && error.message.includes("Kakao REST API key is required")) {
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof Error && error.message.includes("No Kakao Local API result matched")) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof Error && error.message.includes("Kakao Local API is currently unreachable")) {
      return c.json({ error: error.message }, 503);
    }
    if (error instanceof Error && error.message.includes("Upstream weather provider is currently unreachable")) {
      return c.json({ error: error.message }, 503);
    }

    console.error("Error serving /api/score:", error);
    return c.json({ error: "Failed to generate night sky score" }, 500);
  }
});

app.get("/api/light-pollution", async (c) => {
  try {
    const input = parseLightPollutionQuery(c.req.query());
    const report = await getLightPollutionReport({
      ...input,
      kakaoRestApiKey: getKakaoRestApiKey(c.env),
    });
    return c.json(report);
  } catch (error) {
    if (error?.name === "ZodError") {
      return c.json({ error: "Invalid query parameters", details: error.issues }, 400);
    }
    if (error instanceof Error && error.message.includes("Kakao REST API key is required")) {
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof Error && error.message.includes("No Kakao Local API result matched")) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof Error && error.message.includes("Kakao Local API is currently unreachable")) {
      return c.json({ error: error.message }, 503);
    }
    if (error instanceof Error && error.message.includes("Failed to estimate light pollution")) {
      return c.json({ error: error.message }, 500);
    }

    console.error("Error serving /api/light-pollution:", error);
    return c.json({ error: "Failed to estimate light pollution" }, 500);
  }
});

app.all("/mcp", async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createDarkSkyServer({
    publicBaseUrl: getPublicBaseUrl(c.req.url, c.env),
    kakaoRestApiKey: getKakaoRestApiKey(c.env),
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

export default {
  fetch: app.fetch,
};
