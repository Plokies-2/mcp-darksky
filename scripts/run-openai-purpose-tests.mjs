import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { buildOutlookToolContent, buildScoreToolContent } from "../src/server.js";
import { getNightSkyOutlookReport, getNightSkyScoreReport } from "../src/service.js";

const MODEL = process.env.OPENAI_TEST_MODEL ?? "gpt-5-mini";
const REASONING_EFFORT = process.env.OPENAI_TEST_REASONING_EFFORT ?? "low";
const OUTPUT_PATH = path.resolve("tmp", "openai-purpose-tests.json");
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").replace(/^"(.*)"$/, "$1");
const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY ?? process.env.REST_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required.");
}

if (!kakaoRestApiKey) {
  throw new Error("KAKAO_REST_API_KEY or REST_API_KEY is required for place_query-based tests.");
}

const developerPrompt = [
  "You are testing a local astrophotography MCP integration.",
  "Use the provided tools when they are relevant.",
  "Reply in Korean when the user writes in Korean.",
  "Keep the final answer concise and purpose-fit.",
  "If the user's intent implies Milky Way, star trail, broadband deep-sky, or narrowband deep-sky, choose the right tool input and pass shooting_goal even when mode is not explicit.",
  "If the purpose is vague, default to general mode and still call a tool instead of asking a clarifying question first.",
  "If the user gives a Korean place name, pass it through place_query before asking a follow-up.",
  "Do not invent site profile fields or custom target coordinates.",
  "Resolve dates in Asia/Seoul.",
].join("\n");

const scenarios = [
  {
    id: "wide_field_milky_way",
    prompt: "2026-03-20 새벽 안반데기에서 은하수 광각 촬영 어때?",
    expectedTool: "score_night_sky",
  },
  {
    id: "star_trail",
    prompt: "2026-03-20 밤 구룡령터널에서 별궤적 찍기 괜찮아?",
    expectedTool: "score_night_sky",
  },
  {
    id: "broadband_deep_sky",
    prompt: "2026-03-20 밤 안반데기에서 안드로메다를 광대역 딥스카이로 찍기 어때?",
    expectedTool: "score_night_sky",
  },
  {
    id: "narrowband_deep_sky",
    prompt: "2026-03-20 밤 안반데기에서 오리온 성운을 듀얼내로우밴드로 찍기 어때?",
    expectedTool: "score_night_sky",
  },
  {
    id: "general_outlook",
    prompt: "2026-03-28 밤 육백마지기 갈 만해?",
    expectedTool: "score_night_sky_outlook",
  },
];

const scoreToolParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    latitude: { type: "number", minimum: 33, maximum: 39.5 },
    longitude: { type: "number", minimum: 124, maximum: 132 },
    place_query: { type: "string", minLength: 2 },
    date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    location_name: { type: "string" },
    timezone: { type: "string" },
    mode: {
      type: "string",
      enum: ["general", "wide_field_milky_way", "wide_field_nightscape", "broadband_deep_sky", "narrowband_deep_sky", "star_trail"],
    },
    shooting_goal: { type: "string", minLength: 2, maxLength: 200 },
    target: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 2 },
        category: { type: "string" },
      },
    },
  },
  required: ["date"],
};

const tools = [
  {
    type: "function",
    name: "score_night_sky",
    description:
      "Use this when you want a detailed dark-sky score, timing windows, and astrophotography recommendations for a Korean observing site. If the user gives a Korean place name, pass it as place_query before asking a follow-up. Fill shooting_goal when the user's purpose is clearer than the explicit mode, such as 은하수, 별궤적, 광대역 딥스카이, or 협대역 딥스카이. If the purpose is vague, default to general mode and still call the tool. Do not invent site profile fields or custom target coordinates.",
    parameters: scoreToolParameters,
  },
  {
    type: "function",
    name: "score_night_sky_outlook",
    description:
      "Use this when the date is farther out and you only need coarse planning. If the user gives a Korean place name, pass it as place_query before asking a follow-up. Fill shooting_goal when the user's purpose is clearer than the explicit mode. If the purpose is vague, default to general mode and still call the tool. Do not invent site profile fields or custom target coordinates.",
    parameters: scoreToolParameters,
  },
];

function extractOutputText(response) {
  return (response.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function extractFunctionCalls(response) {
  return (response.output ?? []).filter((item) => item.type === "function_call");
}

async function createResponse(body) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function runTool(call) {
  const args = JSON.parse(call.arguments ?? "{}");

  if (call.name === "score_night_sky") {
    const report = await getNightSkyScoreReport({
      ...args,
      kakaoRestApiKey,
      publicBaseUrl: "http://localhost:3000",
    });
    return {
      name: call.name,
      args,
      output: {
        content_text: buildScoreToolContent(report),
        structuredContent: report,
      },
    };
  }

  if (call.name === "score_night_sky_outlook") {
    const report = await getNightSkyOutlookReport({
      ...args,
      kakaoRestApiKey,
    });
    return {
      name: call.name,
      args,
      output: {
        content_text: buildOutlookToolContent(report),
        structuredContent: report,
      },
    };
  }

  throw new Error(`Unsupported tool call: ${call.name}`);
}

async function runScenario(scenario) {
  let response = await createResponse({
    model: MODEL,
    reasoning: {
      effort: REASONING_EFFORT,
    },
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: developerPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: scenario.prompt }],
      },
    ],
    tools,
  });

  const toolResults = [];

  for (let turn = 0; turn < 6; turn += 1) {
    const calls = extractFunctionCalls(response);
    if (!calls.length) {
      break;
    }

    const outputs = [];
    for (const call of calls) {
      const result = await runTool(call);
      toolResults.push(result);
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result.output),
      });
    }

    response = await createResponse({
      model: MODEL,
      reasoning: {
        effort: REASONING_EFFORT,
      },
      previous_response_id: response.id,
      input: outputs,
      tools,
    });
  }

  return {
    id: scenario.id,
    prompt: scenario.prompt,
    expectedTool: scenario.expectedTool,
    toolResults,
    finalResponse: extractOutputText(response),
    rawResponseId: response.id,
  };
}

const results = [];
for (const scenario of scenarios) {
  results.push(await runScenario(scenario));
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
  model: MODEL,
  reasoning_effort: REASONING_EFFORT,
  developer_prompt: developerPrompt,
  results,
}, null, 2));

console.log(JSON.stringify({
  output_path: OUTPUT_PATH,
  model: MODEL,
  reasoning_effort: REASONING_EFFORT,
  scenario_count: results.length,
  results: results.map((result) => ({
    id: result.id,
    expectedTool: result.expectedTool,
    toolNames: result.toolResults.map((toolResult) => toolResult.name),
    finalResponse: result.finalResponse,
  })),
}, null, 2));
