import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createDarkSkyServer } from "./server.js";

const port = Number(process.env.PORT ?? process.env.MCP_PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;

const app = createMcpExpressApp({
  host,
  allowedHosts: process.env.ALLOWED_HOSTS
    ? process.env.ALLOWED_HOSTS.split(",").map((value) => value.trim()).filter(Boolean)
    : undefined,
});

const transports = {};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mcp-darksky",
    transport: "streamable-http",
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "mcp-darksky",
    transport: "streamable-http",
    mcp_endpoint: `${publicBaseUrl}/mcp`,
    health_endpoint: `${publicBaseUrl}/health`,
  });
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

      const server = createDarkSkyServer();
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
