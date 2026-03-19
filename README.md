# mcp-darksky

Public MCP server for Korean night-sky photography scoring.

This project exposes multiple entry points inspired by lightweight public MCP deployments:

- MCP endpoint for ChatGPT or other MCP clients
- JSON API for scripts and automations
- Prompt fallback page for users who do not want to configure MCP
- Install page that can be shared as a single onboarding link

## Tools

### `score_night_sky`
- Input: `latitude` and `longitude`, or `place_query`, plus `date`, `timezone`, and optional site profile
- Output: hourly scores, overall scores, best window, and risk flags

### `estimate_light_pollution`
- Input: `latitude` and `longitude`, or `place_query`
- Output: local Black Marble radiance context plus an estimated Bortle-like band

### `describe_scoring_model`
- Returns a concise explanation of score fields and recommendation fields

### `score_night_sky_via_link`
- Returns shareable links for MCP, JSON API, prompt page, and install page

## Run Modes

### Local MCP

```bash
npm run start:stdio
```

### Node HTTP server

```bash
npm run start:http
```

### Cloudflare Workers style

```bash
npm run dev:worker
npm run deploy:worker
```

## Entry Points

- `/mcp`: MCP endpoint
- `/api/score`: JSON API
- `/api/light-pollution`: JSON API for local Black Marble Bortle-like estimate
- `/prompt`: prompt fallback page
- `/prompt.txt`: plain text prompt
- `/install`: install and share page
- `/health`: health check

## Environment Variables

- `PORT` or `MCP_PORT`: Node HTTP port
- `HOST`: Node HTTP bind host, default `0.0.0.0`
- `PUBLIC_BASE_URL`: public base URL shown in links and pages
- `KAKAO_REST_API_KEY`: optional, required only when using `place_query`
- `REST_API_KEY`: supported alias for local `.env` setups
- `ALLOWED_HOSTS`: comma-separated host allowlist for Node HTTP
- `MCP_TRANSPORT=http`: run `npm start` in HTTP mode

For Workers, set `PUBLIC_BASE_URL` and `KAKAO_REST_API_KEY` in `wrangler.toml` or as deployed variables.

## Notes

- `site_profile.bortle_class` lets callers reflect site light pollution.
- `place_query` resolves Korean place names and addresses through the Kakao Local REST API.
- If `data/VNP46A4` and `data/VJ146A4` contain the local annual Black Marble tiles, the service estimates a Bortle-like class automatically.
- `GET /api/score` only works for dates inside the current Open-Meteo forecast window.
- If the upstream weather provider is temporarily unreachable, the API returns `503`.
- The Workers entry uses stateless Web Standard Streamable HTTP transport, which fits lightweight public deployment.

## Development

```bash
npm install
npm run build:light-pollution-stats
npm test
```
