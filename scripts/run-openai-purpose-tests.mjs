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
  "If the user did not explicitly name a celestial target, keep mode as general by default instead of upgrading to a target-specific deep-sky mode.",
  "Exception: if the user directly named a shooting type like Milky Way or star trail, that explicit shooting type can still drive the mode.",
  "If the user gives a Korean place name, pass it through place_query before asking a follow-up.",
  "Do not invent site profile fields, target names, or custom target coordinates.",
  "Only pass target when the user explicitly named a target.",
  "If mode is general or the request is vague, omit target entirely.",
  "Never place placeholders like '일반', '일반 관측', '야간 관측', '하늘', or 'none' into target.",
  "For general-mode requests, keep the answer mode-neutral and avoid Milky Way/deep-sky/star-trail/filter wording unless the user explicitly asked for it.",
  "Do not rewrite a vague request into a specific Milky Way or deep-sky subtype.",
  "Resolve dates in Asia/Seoul.",
].join("\n");

const scenarios = [
  {
    id: "wide_field_milky_way",
    prompt: "2026-03-20 새벽 안반데기에서 은하수 광각 촬영 어때?",
    expectedTool: "score_night_sky",
    expectedResolvedMode: "wide_field_milky_way",
  },
  {
    id: "wide_field_nightscape",
    prompt: "2026-03-20 밤 구룡령터널에서 전경 넣은 야경 은하수 말고 밤풍경 광각 촬영 어때?",
    expectedTool: "score_night_sky",
    expectedResolvedMode: "wide_field_nightscape",
  },
  {
    id: "star_trail",
    prompt: "2026-03-20 밤 구룡령터널에서 별궤적 찍기 괜찮아?",
    expectedTool: "score_night_sky",
    expectedResolvedMode: "star_trail",
  },
  {
    id: "broadband_deep_sky",
    prompt: "2026-03-20 밤 안반데기에서 안드로메다를 광대역 딥스카이로 찍기 어때?",
    expectedTool: "score_night_sky",
    expectedResolvedMode: "broadband_deep_sky",
    expectedTargetName: "Andromeda Galaxy",
    expectAdvancedTip: true,
  },
  {
    id: "narrowband_deep_sky",
    prompt: "2026-03-20 밤 안반데기에서 오리온 성운을 듀얼내로우밴드로 찍기 어때?",
    expectedTool: "score_night_sky",
    expectedResolvedMode: "narrowband_deep_sky",
    expectedTargetName: "Orion Nebula",
    expectAdvancedTip: true,
  },
  {
    id: "general_score",
    prompt: "2026-03-20 밤 안반데기 어때?",
    expectedTool: "score_night_sky",
    expectedResolvedMode: "general",
    forbidTargetArg: true,
    forbiddenResponseTerms: ["은하수", "딥스카이", "별궤적", "협대역", "광대역"],
  },
  {
    id: "general_outlook",
    prompt: "2026-03-28 밤 육백마지기 갈 만해?",
    expectedTool: "score_night_sky_outlook",
    expectedResolvedMode: "general",
    forbidTargetArg: true,
    forbiddenResponseTerms: ["은하수", "딥스카이", "별궤적", "협대역", "광대역"],
  },
  {
    id: "distant_broadband_outlook",
    prompt: "2026-03-28 밤 안반데기에서 안드로메다 광대역 딥스카이 어때?",
    expectedTool: "score_night_sky_outlook",
    expectedResolvedMode: "broadband_deep_sky",
    expectedTargetName: "Andromeda Galaxy",
    expectAdvancedTip: true,
  },
];
const requestedScenarioIds = new Set(process.argv.slice(2));
const activeScenarios = requestedScenarioIds.size
  ? scenarios.filter((scenario) => requestedScenarioIds.has(scenario.id))
  : scenarios;

const scoreToolParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
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
      "Use this when you want a detailed dark-sky score, timing windows, and astrophotography recommendations for a Korean observing site for dates up to roughly 5 days ahead. If the user gives a Korean place name, pass it as place_query before asking a follow-up. Fill shooting_goal when the user's purpose is clearer than the explicit mode, such as 은하수, 별궤적, 광대역 딥스카이, or 협대역 딥스카이. If the user did not explicitly name a celestial target, keep mode as general by default instead of upgrading to a target-specific deep-sky mode. Exception: direct Milky Way or star-trail wording can still drive a specific mode. If the purpose is vague, default to general mode and still call the tool. For general/vague requests, omit target entirely. Do not invent site profile fields, target names, custom target coordinates, or a specific subtype when the request is vague.",
    parameters: scoreToolParameters,
  },
  {
    type: "function",
    name: "score_night_sky_outlook",
    description:
      "Use this when the date is farther out and you only need coarse planning, especially beyond roughly 5 days ahead. If the user gives a Korean place name, pass it as place_query before asking a follow-up. Fill shooting_goal when the user's purpose is clearer than the explicit mode. If the user did not explicitly name a celestial target, keep mode as general by default instead of upgrading to a target-specific deep-sky mode. Exception: direct Milky Way or star-trail wording can still drive a specific mode. If the purpose is vague, default to general mode and still call the tool. For general/vague requests, omit target entirely. Do not invent site profile fields, target names, custom target coordinates, or a specific subtype when the request is vague.",
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
    expectedResolvedMode: scenario.expectedResolvedMode,
    toolResults,
    finalResponse: extractOutputText(response),
    rawResponseId: response.id,
  };
}

function ensure(condition, message, issues) {
  if (!condition) {
    issues.push(message);
  }
}

function getPrimaryToolResult(result) {
  return result.toolResults[0] ?? null;
}

function getResolvedMode(toolResult) {
  return (
    toolResult?.output?.structuredContent?.request_context?.resolved_mode
    ?? toolResult?.output?.structuredContent?.summary?.active_mode
    ?? toolResult?.output?.structuredContent?.scores?.active_mode
    ?? null
  );
}

function validateScenarioResult(result) {
  const scenario = scenarios.find((candidate) => candidate.id === result.id);
  const issues = [];
  const toolResult = getPrimaryToolResult(result);
  const resolvedMode = getResolvedMode(toolResult);
  const structured = toolResult?.output?.structuredContent ?? {};
  const advancedTip = structured?.request_context?.advanced_tip ?? null;
  const targetName = structured?.astronomy_context?.target?.name ?? structured?.request_context?.resolved_target?.name ?? null;
  const ignoredTargetName = structured?.request_context?.ignored_target_name ?? null;

  ensure(Boolean(toolResult), "No tool call was made.", issues);
  ensure(toolResult?.name === scenario.expectedTool, `Expected tool ${scenario.expectedTool}, got ${toolResult?.name ?? "none"}.`, issues);
  ensure(resolvedMode === scenario.expectedResolvedMode, `Expected resolved_mode ${scenario.expectedResolvedMode}, got ${resolvedMode ?? "none"}.`, issues);

  if (scenario.expectedTargetName) {
    ensure(targetName === scenario.expectedTargetName, `Expected resolved target ${scenario.expectedTargetName}, got ${targetName ?? "none"}.`, issues);
  }

  if (scenario.forbidTargetArg) {
    ensure(!toolResult?.args?.target, "Target argument should have been omitted for this scenario.", issues);
    ensure(!ignoredTargetName, `Unexpected ignored target name: ${ignoredTargetName}.`, issues);
  }

  if (scenario.expectAdvancedTip) {
    ensure(Boolean(advancedTip), "Expected an advanced tip in request_context.", issues);
    ensure(/있다면|필터|협대역|광대역/u.test(result.finalResponse), "Expected the final response to mention optional advanced guidance.", issues);
  }

  if (scenario.forbiddenResponseTerms?.length) {
    for (const term of scenario.forbiddenResponseTerms) {
      ensure(!result.finalResponse.includes(term), `Final response should stay neutral and omit '${term}'.`, issues);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    resolvedMode,
    targetName,
    ignoredTargetName,
    advancedTipPresent: Boolean(advancedTip),
  };
}

const results = [];
for (const scenario of activeScenarios) {
  const result = await runScenario(scenario);
  result.validation = validateScenarioResult(result);
  results.push(result);
}

const failedResults = results.filter((result) => !result.validation?.ok);

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
    expectedResolvedMode: result.expectedResolvedMode,
    toolNames: result.toolResults.map((toolResult) => toolResult.name),
    resolvedMode: result.validation?.resolvedMode,
    validationOk: result.validation?.ok ?? false,
    issues: result.validation?.issues ?? [],
    finalResponse: result.finalResponse,
  })),
}, null, 2));

if (failedResults.length) {
  throw new Error(
    failedResults
      .map((result) => `${result.id}: ${(result.validation?.issues ?? []).join(" | ")}`)
      .join("\n"),
  );
}
