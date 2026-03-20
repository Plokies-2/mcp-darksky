import "dotenv/config";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  getCachedLightPollutionReport,
  getCachedNightSkyOutlookReport,
  getCachedNightSkyScoreReport,
} from "./cached-reports.js";
import { createDarkSkyServer } from "./server.js";
import {
  buildPromptPage,
  buildPromptText,
  getLightPollutionMethodologyReport,
  parseLightPollutionQuery,
  parseOutlookQuery,
  parseScoreQuery,
} from "./service.js";
import { buildHomePage, buildInstallPage } from "./web-ui.js";

const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY ?? process.env.REST_API_KEY;

const app = createMcpExpressApp({
  host,
  allowedHosts: process.env.ALLOWED_HOSTS
    ? process.env.ALLOWED_HOSTS.split(",").map((value) => value.trim()).filter(Boolean)
    : undefined,
});
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
    const input = parseScoreQuery(req.query);
    const { report, cacheStatus } = await getCachedNightSkyScoreReport({
      ...input,
      kakaoRestApiKey,
      publicBaseUrl,
    });
    if (report.report_kind === "fallback_required") {
      res.setHeader("X-Cache", cacheStatus);
      res.status(409).json(report);
      return;
    }
    res.setHeader("X-Cache", cacheStatus);
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

app.get("/api/score-outlook", async (req, res) => {
  try {
    const input = parseOutlookQuery(req.query);
    const { report, cacheStatus } = await getCachedNightSkyOutlookReport({
      ...input,
      kakaoRestApiKey,
    });
    res.setHeader("X-Cache", cacheStatus);
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

    console.error("Error serving /api/score-outlook:", error);
    res.status(500).json({ error: "Failed to generate night sky outlook" });
  }
});

app.get("/api/light-pollution", async (req, res) => {
  try {
    const input = parseLightPollutionQuery(req.query);
    const { report, cacheStatus } = await getCachedLightPollutionReport({
      ...input,
      kakaoRestApiKey,
    });
    res.setHeader("X-Cache", cacheStatus);
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

app.get("/api/light-pollution/method", (_req, res) => {
  res.json(getLightPollutionMethodologyReport());
});

async function handleStatelessMcpRequest(req, res) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = createDarkSkyServer({ publicBaseUrl, kakaoRestApiKey });
  res.on("close", () => {
    if (typeof transport.close === "function") {
      transport.close().catch(() => {});
    }
    if (typeof server.close === "function") {
      server.close().catch(() => {});
    }
  });
  try {
    await server.connect(transport);
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

app.post("/mcp", handleStatelessMcpRequest);

function sendMcpMethodNotAllowed(res) {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
}

app.get("/mcp", (_req, res) => {
  sendMcpMethodNotAllowed(res);
});

app.delete("/mcp", (_req, res) => {
  sendMcpMethodNotAllowed(res);
});

const listener = app.listen(port, host, () => {
  console.log(`mcp-darksky listening on ${host}:${port}`);
  console.log(`MCP endpoint: ${publicBaseUrl}/mcp`);
});

async function shutdown() {
  listener.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
