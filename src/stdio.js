import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDarkSkyServer } from "./server.js";

const server = createDarkSkyServer();
const transport = new StdioServerTransport();

await server.connect(transport);
