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
- Output: local Black Marble radiance context plus an estimated Bortle-like center, range, equivalent zenith brightness proxy, and Korea-wide brightness percentile when distribution data is present

### `describe_light_pollution_method`
- Returns the evidence sources, guardrails, and release checks for the light-pollution estimator

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
- `/api/score-outlook`: coarse outlook API for dates beyond the full-detail window
- `/api/light-pollution`: JSON API for local Black Marble Bortle-like estimate
- `/api/light-pollution/method`: methodology metadata and review guardrails
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
- `score_night_sky` uses full hourly detail only through `+5 days`; from `+6 days` onward the service intentionally downgrades to the outlook path to avoid false precision.
- External Open-Meteo and Kakao API calls use an initial request plus up to 3 retries when upstream does not respond or returns retryable status codes.
- If `data/VNP46A4` and `data/VJ146A4` contain the local annual Black Marble tiles, the service estimates a continuous Bortle-like center automatically and includes an uncertainty range.
- If `data/black-marble-korea-distribution.json` exists, the service also reports where a location sits within the Republic of Korea-only brightness distribution.
- `GET /api/score` only works for dates inside the current Open-Meteo forecast window.
- If the upstream weather provider is temporarily unreachable, the API returns `503`.
- The Workers entry uses stateless Web Standard Streamable HTTP transport, which fits lightweight public deployment.

## Development

```bash
npm install
npm run build:light-pollution-stats
npm run build:light-pollution-distribution
npm test
```

## Deployment Checklist

1. Set required environment variables.
   - `PUBLIC_BASE_URL`
   - `KAKAO_REST_API_KEY` if you want `place_query`
   - `ALLOWED_HOSTS` for Node HTTP deployments
2. Confirm local data files exist if you want light-pollution estimation.
   - `data/VNP46A4/...`
   - `data/VJ146A4/...`
   - `data/black-marble-korea-distribution.json`
3. Run verification before deploy.
   - `npm test`
   - smoke-check `/health`
   - smoke-check `/api/score-outlook`
4. Deploy one runtime.
   - Node HTTP: `npm run start:http`
   - Workers: `npm run deploy:worker`
5. Post-deploy smoke test.
   - `/health`
   - `/mcp`
   - `/api/score?latitude=37.6229&longitude=128.7391&date=<within-5-days>`
   - `/api/score-outlook?latitude=37.6229&longitude=128.7391&date=<6+-days>`
6. Share the onboarding link.
   - `/install`
