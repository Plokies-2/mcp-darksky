import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDarkSkyServer } from "./server.js";

const server = createDarkSkyServer({
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY ?? process.env.REST_API_KEY,
});
const transport = new StdioServerTransport();

await server.connect(transport);
