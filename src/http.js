import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
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

const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY ?? process.env.REST_API_KEY;

const app = createMcpExpressApp({
  host,
  allowedHosts: process.env.ALLOWED_HOSTS
    ? process.env.ALLOWED_HOSTS.split(",").map((value) => value.trim()).filter(Boolean)
    : undefined,
});

const transports = {};
const scoreCache = new Map();
const SCORE_CACHE_TTL_MS = 15 * 60 * 1000;

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mcp-darksky",
    transport: "streamable-http",
  });
});

app.get("/", (_req, res) => {
  res.type("html").send(buildHomePage({ publicBaseUrl }));
});

app.get("/install", (_req, res) => {
  res.type("html").send(buildInstallPage({ publicBaseUrl }));
});

app.get("/prompt", (_req, res) => {
  res.type("html").send(buildPromptPage({ publicBaseUrl }));
});

app.get("/prompt.txt", (_req, res) => {
  res.type("text/plain").send(buildPromptText({ publicBaseUrl }));
});

app.get("/api/score", async (req, res) => {
  try {
    const cacheKey = JSON.stringify(
      Object.entries(req.query)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, value]),
    );
    const cached = scoreCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("X-Cache", "HIT");
      res.json(cached.payload);
      return;
    }

    const input = parseScoreQuery(req.query);
    const report = await getNightSkyScoreReport({
      ...input,
      kakaoRestApiKey,
    });
    scoreCache.set(cacheKey, {
      expiresAt: Date.now() + SCORE_CACHE_TTL_MS,
      payload: report,
    });
    res.setHeader("X-Cache", "MISS");
    res.json(report);
  } catch (error) {
    if (error?.name === "ZodError") {
      res.status(400).json({
        error: "Invalid query parameters",
        details: error.issues,
      });
      return;
    }
    if (error instanceof RangeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes("Kakao REST API key is required")) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes("No Kakao Local API result matched")) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes("Kakao Local API is currently unreachable")) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes("Upstream weather provider is currently unreachable")) {
      res.status(503).json({ error: error.message });
      return;
    }

    console.error("Error serving /api/score:", error);
    res.status(500).json({ error: "Failed to generate night sky score" });
  }
});

app.get("/api/light-pollution", async (req, res) => {
  try {
    const input = parseLightPollutionQuery(req.query);
    const report = await getLightPollutionReport({
      ...input,
      kakaoRestApiKey,
    });
    res.json(report);
  } catch (error) {
    if (error?.name === "ZodError") {
      res.status(400).json({
        error: "Invalid query parameters",
        details: error.issues,
      });
      return;
    }
    if (error instanceof Error && error.message.includes("Kakao REST API key is required")) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes("No Kakao Local API result matched")) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes("Kakao Local API is currently unreachable")) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes("Failed to estimate light pollution")) {
      res.status(500).json({ error: error.message });
      return;
    }

    console.error("Error serving /api/light-pollution:", error);
    res.status(500).json({ error: "Failed to estimate light pollution" });
  }
});

async function handleSessionRequest(req, res) {
  const sessionId = req.headers["mcp-session-id"];

  try {
    let transport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
        },
      });

      transport.onclose = () => {
        const activeSessionId = transport.sessionId;
        if (activeSessionId && transports[activeSessionId]) {
          delete transports[activeSessionId];
        }
      };

      const server = createDarkSkyServer({ publicBaseUrl, kakaoRestApiKey });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: missing or invalid MCP session",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
}

app.post("/mcp", handleSessionRequest);

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await transports[sessionId].handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await transports[sessionId].handleRequest(req, res);
});

const listener = app.listen(port, host, () => {
  console.log(`mcp-darksky listening on ${host}:${port}`);
  console.log(`MCP endpoint: ${publicBaseUrl}/mcp`);
});

async function shutdown() {
  for (const sessionId of Object.keys(transports)) {
    await transports[sessionId].close();
    delete transports[sessionId];
  }

  listener.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
