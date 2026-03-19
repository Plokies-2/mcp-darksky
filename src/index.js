import "dotenv/config";

await import(process.env.MCP_TRANSPORT === "http" ? "./http.js" : "./stdio.js");
