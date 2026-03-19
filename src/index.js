import "dotenv/config";

const requestedTransport = process.env.MCP_TRANSPORT;
const inferredTransport =
  requestedTransport === "http" ||
  (requestedTransport !== "stdio" && (process.env.PORT || process.env.RAILWAY_PUBLIC_DOMAIN))
    ? "http"
    : "stdio";

await import(inferredTransport === "http" ? "./http.js" : "./stdio.js");
