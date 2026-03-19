import { getSuggestedForecastDate } from "./service.js";

export function buildInstallPage({ publicBaseUrl }) {
  const sampleDate = getSuggestedForecastDate("Asia/Seoul");
  const endpoint = `${publicBaseUrl}/mcp`;
  const apiExample =
    `${publicBaseUrl}/api/score?latitude=35.15&longitude=128.99&date=${sampleDate}&location_name=Busan&bortle_class=4`;
  const placeApiExample =
    `${publicBaseUrl}/api/score?place_query=%EC%95%88%EB%B0%98%EB%8D%B0%EA%B8%B0&date=${sampleDate}&bortle_class=3`;
  const promptPage = `${publicBaseUrl}/prompt`;

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>mcp-darksky install</title>
    <style>
      :root {
        --bg: #04101b;
        --panel: rgba(8, 18, 29, 0.9);
        --border: rgba(130, 197, 255, 0.18);
        --text: #eef6ff;
        --muted: #9ab1c4;
        --accent: #90d4ff;
        --accent-2: #d4f28a;
        --button: #12324a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Pretendard", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top, rgba(91, 149, 255, 0.22), transparent 32%),
          radial-gradient(circle at 18% 12%, rgba(212, 242, 138, 0.14), transparent 20%),
          linear-gradient(180deg, #03070d 0%, #071420 46%, #0a1f2f 100%);
      }
      main {
        width: min(1024px, calc(100% - 28px));
        margin: 28px auto 40px;
        display: grid;
        gap: 16px;
      }
      section {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 22px;
        backdrop-filter: blur(12px);
      }
      .hero { display: grid; gap: 10px; }
      .eyebrow {
        color: var(--accent);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1, h2 { margin: 0 0 10px; }
      p, li { color: var(--muted); line-height: 1.6; }
      ol { margin: 0; padding-left: 22px; }
      code, pre, input { font-family: "Cascadia Code", "Consolas", monospace; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
      }
      .card {
        padding: 18px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.02);
      }
      .endpoint {
        width: 100%;
        margin: 10px 0 12px;
        padding: 12px 14px;
        color: var(--text);
        background: rgba(3, 8, 16, 0.88);
        border: 1px solid rgba(144, 212, 255, 0.18);
        border-radius: 12px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      button, a.button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(144, 212, 255, 0.2);
        background: var(--button);
        color: var(--text);
        cursor: pointer;
      }
      .muted-button { background: rgba(255, 255, 255, 0.02); }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 15px;
        border-radius: 12px;
        background: rgba(3, 8, 16, 0.88);
        border: 1px solid rgba(144, 212, 255, 0.14);
      }
      .note { color: var(--accent-2); font-weight: 600; }
      .toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(12, 34, 51, 0.94);
        border: 1px solid rgba(144, 212, 255, 0.22);
        color: var(--text);
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 160ms ease, transform 160ms ease;
      }
      .toast.show {
        opacity: 1;
        transform: translateY(0);
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="eyebrow">Install Guide</div>
        <h1>mcp-darksky를 설치하거나 공유하는 가장 쉬운 방법</h1>
        <p>이 페이지 링크 하나만 보내면 됩니다. MCP를 아는 사용자도, 모르는 사용자도 같은 링크에서 시작할 수 있습니다.</p>
      </section>
      <section class="grid">
        <div class="card">
          <h2>ChatGPT용 MCP 주소</h2>
          <p>ChatGPT의 custom MCP connector에 아래 주소를 붙여 넣으면 됩니다.</p>
          <input class="endpoint" value="${endpoint}" readonly id="mcp-endpoint" />
          <div class="actions">
            <button type="button" data-copy="#mcp-endpoint">MCP 주소 복사</button>
          </div>
        </div>
        <div class="card">
          <h2>MCP 없이도 사용 가능</h2>
          <p>프롬프트 안내 페이지를 열어서 그대로 AI에 붙여 넣어도 됩니다.</p>
          <input class="endpoint" value="${promptPage}" readonly id="prompt-page" />
          <div class="actions">
            <button type="button" data-copy="#prompt-page">프롬프트 링크 복사</button>
            <a class="button muted-button" href="${promptPage}">프롬프트 열기</a>
          </div>
        </div>
      </section>
      <section>
        <h2>빠른 사용 순서</h2>
        <ol>
          <li>ChatGPT에서 custom MCP connector 추가 화면을 엽니다.</li>
          <li>이 페이지의 MCP 주소를 복사합니다.</li>
          <li>붙여 넣고 저장합니다.</li>
          <li><code>오늘 안반데기 별사진 가능해?</code>처럼 물어봅니다.</li>
        </ol>
        <p class="note">설정이 어려운 사용자에게는 <code>${promptPage}</code> 링크만 보내도 됩니다.</p>
      </section>
      <section class="grid">
        <div class="card">
          <h2>좌표 기반 JSON API</h2>
          <p>스크립트나 자동화에서는 구조화된 JSON을 직접 호출할 수 있습니다.</p>
          <pre id="api-example">${apiExample}</pre>
          <div class="actions">
            <button type="button" data-copy="#api-example">API 예시 복사</button>
          </div>
        </div>
        <div class="card">
          <h2>장소명 기반 JSON API</h2>
          <p>카카오 Local API 키가 설정되어 있으면 한국 장소명만으로 조회할 수 있습니다.</p>
          <pre id="place-api-example">${placeApiExample}</pre>
          <div class="actions">
            <button type="button" data-copy="#place-api-example">장소명 API 예시 복사</button>
          </div>
        </div>
      </section>
    </main>
    <div class="toast" id="toast">복사되었습니다.</div>
    <script>
      const toast = document.getElementById("toast");
      async function copyText(text) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
        }
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 1400);
      }
      document.querySelectorAll("[data-copy]").forEach((button) => {
        button.addEventListener("click", () => {
          const target = document.querySelector(button.getAttribute("data-copy"));
          copyText(target.value ?? target.textContent ?? "");
        });
      });
    </script>
  </body>
</html>`;
}

export function buildHomePage({ publicBaseUrl }) {
  const sampleDate = getSuggestedForecastDate("Asia/Seoul");
  const coordinateExample = `${publicBaseUrl}/api/score?latitude=35.15&longitude=128.99&date=${sampleDate}`;
  const placeExample = `${publicBaseUrl}/api/score?place_query=%EC%95%88%EB%B0%98%EB%8D%B0%EA%B8%B0&date=${sampleDate}`;

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>mcp-darksky</title>
    <style>
      :root {
        --bg: #030912;
        --panel: rgba(10, 19, 31, 0.9);
        --border: rgba(122, 185, 255, 0.16);
        --text: #edf5ff;
        --muted: #97acc0;
        --accent: #89d6ff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Pretendard", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top, rgba(86, 146, 255, 0.24), transparent 35%),
          radial-gradient(circle at 25% 15%, rgba(201, 239, 139, 0.16), transparent 20%),
          linear-gradient(180deg, #03070d 0%, #07121d 45%, #0b1c2d 100%);
      }
      main {
        width: min(1040px, calc(100% - 32px));
        margin: 34px auto 42px;
        display: grid;
        gap: 18px;
      }
      section {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 22px;
        backdrop-filter: blur(10px);
      }
      h1, h2 { margin: 0 0 10px; }
      p { color: var(--muted); line-height: 1.6; }
      code, pre { font-family: "Cascadia Code", "Consolas", monospace; }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 15px;
        border-radius: 14px;
        background: rgba(3, 8, 16, 0.82);
        border: 1px solid rgba(137, 214, 255, 0.14);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 14px;
      }
      .card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 14px;
        padding: 16px;
      }
      .eyebrow {
        color: var(--accent);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .cta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 8px;
      }
      .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(137, 214, 255, 0.18);
        text-decoration: none;
        color: var(--text);
        background: rgba(18, 50, 74, 0.86);
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="eyebrow">Night Sky Entry Points</div>
        <h1>mcp-darksky</h1>
        <p>밤하늘 촬영 조건을 점수화하는 공개용 MCP 서비스입니다. MCP 사용자와 비사용자 모두를 위한 입구를 함께 제공합니다.</p>
        <div class="cta-row">
          <a class="cta" href="${publicBaseUrl}/install">설치 안내</a>
          <a class="cta" href="${publicBaseUrl}/prompt">프롬프트 안내</a>
        </div>
      </section>
      <section class="grid">
        <div class="card">
          <h2>MCP</h2>
          <p>ChatGPT나 MCP 클라이언트에 직접 연결</p>
          <pre>${publicBaseUrl}/mcp</pre>
        </div>
        <div class="card">
          <h2>JSON API</h2>
          <p>좌표를 넣어서 구조화된 결과를 바로 조회</p>
          <pre>${coordinateExample}</pre>
        </div>
        <div class="card">
          <h2>Place Query</h2>
          <p>카카오 Local API 키가 있으면 한국 장소명으로 조회</p>
          <pre>${placeExample}</pre>
        </div>
        <div class="card">
          <h2>Prompt</h2>
          <p>MCP 설정이 어려운 사용자를 위한 안내 페이지</p>
          <pre>${publicBaseUrl}/prompt</pre>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
