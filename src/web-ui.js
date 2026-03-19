import { getSuggestedForecastDate } from "./service.js";

function buildSharedHead({ title }) {
  return `
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#030508" />
    <link
      rel="icon"
      href='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="%23030508"/><circle cx="32" cy="32" r="17" fill="%23ffffff"/><path d="M18 24h26c-2 1.4-4 2.5-8 2.5H18V24zm0 7h22c-2 1.3-4.7 2.5-8.7 2.5H18V31zm0 7h18c-2 1.3-5 2.5-9 2.5H18V38z" fill="%23030508"/></svg>'
    />
    <title>${title}</title>
    <style>
      :root {
        --bg-0: #030508;
        --bg-1: #0a1020;
        --bg-2: #111b30;
        --panel: rgba(255, 255, 255, 0.05);
        --panel-strong: rgba(255, 255, 255, 0.08);
        --border: rgba(255, 255, 255, 0.12);
        --border-strong: rgba(255, 255, 255, 0.18);
        --text: #eef3ff;
        --muted: #a7b4ce;
        --muted-strong: #cdd7ea;
        --accent: #a7b8ff;
        --accent-soft: rgba(125, 141, 255, 0.18);
        --accent-secondary: #8fafff;
        --accent-green: #d5e2b7;
        --shadow: 0 28px 80px rgba(0, 0, 0, 0.35);
        --radius-lg: 28px;
        --radius-md: 20px;
        --radius-sm: 14px;
        --content-width: min(1180px, calc(100% - 40px));
      }

      * { box-sizing: border-box; }

      html { color-scheme: dark; }

      body {
        margin: 0;
        font-family: "SF Pro Display", "SF Pro Text", "Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at 16% 18%, rgba(125, 141, 255, 0.14), transparent 24%),
          radial-gradient(circle at 78% 12%, rgba(157, 117, 255, 0.09), transparent 26%),
          radial-gradient(circle at 54% 68%, rgba(143, 175, 255, 0.08), transparent 34%),
          radial-gradient(circle at 50% -8%, rgba(255, 255, 255, 0.09), transparent 24%),
          linear-gradient(180deg, var(--bg-0) 0%, var(--bg-1) 46%, var(--bg-2) 100%);
        min-height: 100vh;
        overflow-x: hidden;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 14%),
          radial-gradient(circle at top, rgba(255, 255, 255, 0.04), transparent 40%);
        pointer-events: none;
        z-index: 0;
      }

      body::after {
        content: "";
        position: fixed;
        inset: 0;
        background:
          radial-gradient(48rem 24rem at 68% 20%, rgba(157, 117, 255, 0.07), transparent 62%),
          radial-gradient(40rem 20rem at 28% 78%, rgba(125, 141, 255, 0.08), transparent 58%);
        filter: blur(18px);
        opacity: 0.9;
        pointer-events: none;
        z-index: 0;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      button,
      input,
      pre,
      code {
        font: inherit;
      }

      .page {
        position: relative;
        z-index: 1;
      }

      .shell {
        width: var(--content-width);
        margin: 0 auto;
      }

      .hero {
        position: relative;
        min-height: min(860px, 100vh);
        padding: 36px 0 48px;
        display: flex;
        align-items: center;
      }

      .hero-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
        gap: 28px;
        align-items: center;
      }

      .hero-copy {
        position: relative;
        padding: 44px 0 28px;
      }

      h1 {
        margin: 0 0 16px;
        font-size: clamp(44px, 7vw, 84px);
        line-height: 0.98;
        letter-spacing: -0.05em;
      }

      .hero-subtitle {
        max-width: 720px;
        margin: 0;
        font-size: clamp(18px, 2vw, 23px);
        line-height: 1.58;
        color: var(--muted);
      }

      .hero-subtitle strong {
        color: var(--text);
        font-weight: 600;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 28px;
      }

      .button,
      button.button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 48px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: transform 180ms ease, background 180ms ease, border-color 180ms ease;
        font-size: 15px;
        font-weight: 600;
      }

      .button:hover,
      button.button:hover {
        transform: translateY(-1px);
      }

      .button-primary {
        background: linear-gradient(180deg, #eef2ff 0%, #dbe4ff 100%);
        color: #09101d;
        box-shadow: 0 18px 42px rgba(125, 141, 255, 0.18);
      }

      .button-secondary {
        background: rgba(255, 255, 255, 0.05);
        border-color: var(--border);
        color: var(--text);
      }

      .hero-trust {
        display: flex;
        flex-wrap: wrap;
        gap: 14px 22px;
        margin-top: 24px;
        color: var(--muted);
        font-size: 14px;
      }

      .hero-trust span {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .hero-trust span::before {
        content: "";
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.5);
      }

      .panel {
        position: relative;
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.035));
        box-shadow: var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(18px);
      }

      .hero-card {
        padding: 28px;
      }

      .stat-card {
        display: grid;
        gap: 18px;
      }

      .chatgpt-shell {
        min-height: 644px;
        border-radius: 30px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background:
          linear-gradient(180deg, rgba(249, 250, 252, 0.98), rgba(243, 245, 248, 0.96));
        color: #14171c;
        overflow: hidden;
        box-shadow:
          0 24px 64px rgba(0, 0, 0, 0.24),
          inset 0 1px 0 rgba(255, 255, 255, 0.8);
        display: flex;
        flex-direction: column;
      }

      .chatgpt-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 58px;
        padding: 0 20px;
        border-bottom: 1px solid rgba(20, 23, 28, 0.08);
        background: rgba(255, 255, 255, 0.74);
      }

      .chatgpt-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .chatgpt-menu {
        width: 22px;
        display: grid;
        gap: 4px;
      }

      .chatgpt-menu span {
        display: block;
        height: 2px;
        border-radius: 999px;
        background: #4b5563;
      }

      .chatgpt-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #6f8bff;
        box-shadow: 0 0 0 4px rgba(111, 139, 255, 0.16);
      }

      .chatgpt-title {
        min-width: 0;
      }

      .chatgpt-title strong {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: #181d24;
      }

      .chatgpt-icons {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #4b5563;
        font-size: 13px;
      }

      .chatgpt-icon {
        width: 26px;
        height: 26px;
        border-radius: 999px;
        border: 1px solid rgba(20, 23, 28, 0.08);
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.92);
      }

      .chatgpt-stage {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 24px;
        padding: 22px 20px 18px;
      }

      .chatgpt-thread {
        display: grid;
        gap: 16px;
        align-content: start;
      }

      .chatgpt-message {
        max-width: 100%;
      }

      .chatgpt-label {
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: #6b7280;
      }

      .chatgpt-user {
        margin-left: auto;
        max-width: 84%;
        padding: 14px 16px;
        border-radius: 22px;
        background: #eceff4;
        color: #10151c;
        font-size: 14px;
        line-height: 1.6;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
      }

      .chatgpt-tool {
        position: relative;
        max-width: 92%;
        padding: 14px 16px 16px;
        border-radius: 18px;
        border: 1px solid rgba(89, 102, 255, 0.12);
        background: rgba(42, 52, 76, 0.86);
        color: #edf2ff;
        backdrop-filter: blur(14px);
        box-shadow: 0 16px 36px rgba(20, 24, 38, 0.18);
      }

      .chatgpt-tool::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 40%);
        pointer-events: none;
      }

      .chatgpt-tool-header {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }

      .chatgpt-tool-header strong {
        font-size: 12px;
        color: #eef2ff;
      }

      .chatgpt-tool-chip {
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(238, 242, 255, 0.86);
        font-size: 11px;
      }

      .mcp-json {
        position: relative;
        z-index: 1;
        margin: 0;
        padding: 0;
        background: transparent;
        border: 0;
        color: rgba(238, 243, 255, 0.9);
        font-size: 12px;
        line-height: 1.68;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .chatgpt-assistant {
        max-width: 92%;
        padding: 2px 0 0;
        color: #10151c;
        font-size: 14px;
        line-height: 1.72;
      }

      .chatgpt-assistant p {
        margin: 0;
      }

      .assistant-truncate {
        color: #6b7280;
      }

      .chatgpt-composer {
        display: grid;
        gap: 10px;
        padding: 18px 18px 16px;
        border-top: 1px solid rgba(20, 23, 28, 0.08);
        background: linear-gradient(180deg, rgba(248, 249, 251, 0.32), rgba(255, 255, 255, 0.92));
      }

      .chatgpt-input {
        min-height: 96px;
        border-radius: 28px;
        border: 1px solid rgba(20, 23, 28, 0.12);
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 14px 28px rgba(17, 24, 39, 0.08);
        padding: 18px 18px 14px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 16px;
      }

      .chatgpt-placeholder {
        font-size: 14px;
        color: #9ca3af;
      }

      .chatgpt-input-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .chatgpt-input-tools {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #5f6b7f;
        font-size: 13px;
      }

      .chatgpt-round {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        border: 1px solid rgba(20, 23, 28, 0.1);
        display: grid;
        place-items: center;
        background: #ffffff;
      }

      .chatgpt-send {
        width: 48px;
        height: 48px;
        border-radius: 999px;
        background: #0f1115;
        color: #ffffff;
        display: grid;
        place-items: center;
        font-size: 20px;
        box-shadow: 0 10px 24px rgba(15, 17, 21, 0.18);
      }

      .section {
        padding: 14px 0 64px;
      }

      .section-header {
        display: grid;
        gap: 8px;
        margin-bottom: 18px;
      }

      .section-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 22px;
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.03em;
      }

      .section-label::before {
        content: "";
        width: 16px;
        height: 1px;
        background: rgba(255, 255, 255, 0.22);
      }

      h2 {
        margin: 0;
        font-size: clamp(28px, 3.2vw, 42px);
        letter-spacing: -0.04em;
      }

      .section-header p,
      .copy,
      li,
      .muted {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }

      .section-header p {
        max-width: 760px;
      }

      .grid {
        display: grid;
        gap: 18px;
        align-items: stretch;
      }

      .grid-3 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-auto-rows: 1fr;
      }

      .grid-2 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-auto-rows: 1fr;
      }

      .feature-card,
      .content-card {
        padding: 22px;
        display: grid;
        gap: 10px;
        align-content: start;
      }

      .feature-card h3,
      .content-card h3 {
        margin: 0;
        font-size: 20px;
        letter-spacing: -0.03em;
      }

      .feature-kicker {
        display: inline-block;
        margin-bottom: 2px;
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.02em;
      }

      .endpoint-box,
      pre {
        width: 100%;
        margin: 14px 0 0;
        padding: 16px 18px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: rgba(2, 6, 14, 0.78);
        color: var(--text);
        overflow: auto;
        font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
        font-size: 14px;
        line-height: 1.6;
      }

      input.endpoint-box {
        appearance: none;
      }

      .card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      .feature-card .card-actions,
      .content-card .card-actions {
        margin-top: auto;
        padding-top: 4px;
      }

      .steps {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 14px;
      }

      .step {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr);
        gap: 16px;
        align-items: start;
        padding: 18px 20px;
      }

      .step-number {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        border: 1px solid var(--border-strong);
        display: grid;
        place-items: center;
        font-weight: 700;
        color: var(--text);
        background: rgba(255, 255, 255, 0.04);
      }

      .step h3 {
        margin: 0 0 6px;
        font-size: 18px;
      }

      .mini-note {
        color: var(--accent-green);
        font-size: 14px;
      }

      .footer-note {
        padding: 0 0 56px;
        text-align: center;
        color: var(--muted);
        font-size: 14px;
      }

      .glass-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
        align-items: stretch;
      }

      .glass-strip .panel {
        padding: 18px 20px;
        border-radius: 22px;
        display: grid;
        gap: 8px;
        align-content: start;
      }

      .glass-strip strong {
        font-size: 16px;
      }

      .stars {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
        pointer-events: none;
        opacity: 0.9;
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto 0 0;
        height: 240px;
        background:
          linear-gradient(180deg, transparent 0%, rgba(3, 5, 8, 0.64) 100%),
          radial-gradient(32rem 10rem at 30% 90%, rgba(125, 141, 255, 0.08), transparent 72%);
        pointer-events: none;
        z-index: 0;
      }

      .toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 10;
        padding: 12px 16px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(7, 15, 25, 0.92);
        color: var(--text);
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 160ms ease, transform 160ms ease;
        backdrop-filter: blur(10px);
      }

      .toast.show {
        opacity: 1;
        transform: translateY(0);
      }

      :focus-visible {
        outline: 2px solid rgba(153, 205, 255, 0.9);
        outline-offset: 3px;
      }

      @media (max-width: 960px) {
        .hero {
          min-height: auto;
          padding-top: 28px;
        }

        .hero-grid,
        .grid-3,
        .grid-2,
        .glass-strip {
          grid-template-columns: 1fr;
        }

        .hero-card {
          padding: 22px;
        }
      }

      @media (max-width: 640px) {
        .shell {
          width: min(100% - 24px, 1180px);
        }

        h1 {
          font-size: clamp(38px, 13vw, 58px);
        }

        .hero-subtitle {
          font-size: 17px;
        }

        .button,
        button.button {
          width: 100%;
        }

        .hero-actions,
        .card-actions {
          flex-direction: column;
        }

        .step {
          grid-template-columns: 1fr;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
        }
      }
    </style>
  `;
}

function buildSharedScript() {
  return `
    <script>
      (() => {
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
          if (toast) {
            toast.classList.add("show");
            clearTimeout(window.__darkskyToastTimer);
            window.__darkskyToastTimer = setTimeout(() => toast.classList.remove("show"), 1400);
          }
        }

        document.querySelectorAll("[data-copy]").forEach((button) => {
          button.addEventListener("click", () => {
            const target = document.querySelector(button.getAttribute("data-copy"));
            copyText(target?.value ?? target?.textContent ?? "");
          });
        });

        const canvas = document.getElementById("hero-stars");
        if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          return;
        }

        const context = canvas.getContext("2d");
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        let stars = [];
        let animationId = 0;
        let running = true;

        function resize() {
          const bounds = canvas.getBoundingClientRect();
          const width = Math.max(1, bounds.width);
          const height = Math.max(1, bounds.height);
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          const density = Math.min(140, Math.max(40, Math.floor((width * height) / 22000)));
          stars = Array.from({ length: density }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 1.3 + 0.2,
            speed: Math.random() * 0.08 + 0.015,
            alphaOffset: Math.random() * Math.PI * 2,
            twinkle: Math.random() * 0.7 + 0.35,
            driftX: (Math.random() - 0.5) * 0.05,
          }));
        }

        function frame() {
          if (!running) {
            return;
          }

          const width = canvas.width / dpr;
          const height = canvas.height / dpr;
          context.clearRect(0, 0, width, height);

          for (const star of stars) {
            star.y += star.speed;
            star.x += star.driftX;

            if (star.y > height + 3) {
              star.y = -2;
              star.x = Math.random() * width;
            }

            if (star.x < -2) {
              star.x = width + 2;
            } else if (star.x > width + 2) {
              star.x = -2;
            }

            star.alphaOffset += star.twinkle * 0.014;
            const alpha = 0.18 + (Math.sin(star.alphaOffset) + 1) * 0.25;

            context.beginPath();
            context.fillStyle = \`rgba(255,255,255,\${alpha.toFixed(3)})\`;
            context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            context.fill();

            context.beginPath();
            context.fillStyle = \`rgba(167, 184, 255, \${(alpha * 0.08).toFixed(3)})\`;
            context.arc(star.x, star.y, star.radius * 5.5, 0, Math.PI * 2);
            context.fill();
          }

          animationId = window.requestAnimationFrame(frame);
        }

        function start() {
          window.cancelAnimationFrame(animationId);
          running = true;
          resize();
          frame();
        }

        start();

        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) {
            running = false;
            window.cancelAnimationFrame(animationId);
          } else {
            start();
          }
        });
      })();
    </script>
  `;
}

export function buildInstallPage({ publicBaseUrl }) {
  const sampleDate = getSuggestedForecastDate("Asia/Seoul");
  const endpoint = `${publicBaseUrl}/mcp`;
  const apiExample =
    `${publicBaseUrl}/api/score?latitude=37.6229&longitude=128.7391&date=${sampleDate}&mode=wide_field_milky_way`;
  const placeApiExample =
    `${publicBaseUrl}/api/score?place_query=%EC%95%88%EB%B0%98%EB%8D%B0%EA%B8%B0%EB%A7%88%EC%9D%84&date=${sampleDate}&mode=wide_field_milky_way`;
  const promptPage = `${publicBaseUrl}/prompt`;
  const outlookExample =
    `${publicBaseUrl}/api/score-outlook?place_query=%EC%95%88%EB%B0%98%EB%8D%B0%EA%B8%B0%EB%A7%88%EC%9D%84&date=2026-03-28&mode=wide_field_milky_way`;

  return `<!doctype html>
<html lang="ko">
  <head>
    ${buildSharedHead({ title: "mcp-darksky 설치 안내" })}
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <canvas class="stars" id="hero-stars" aria-hidden="true"></canvas>
        <div class="shell hero-grid">
          <div class="hero-copy">
            <h1>AI와 함께<br />오늘 밤 가장 알맞은<br />타이밍을 찾으세요.</h1>
            <p class="hero-subtitle">
              <strong>mcp-darksky</strong>는 구름, 달빛, 광해, 대기질 등 필요한 모든 요소를 한 번에 점수화해
              <strong>그 날의 가능성과</strong>와 <strong>시간대별 가능성</strong>까지 바로 정리합니다.
            </p>
            <div class="hero-actions">
              <a class="button button-primary" href="#connect">MCP 주소 확인하기</a>
              <a class="button button-secondary" href="${promptPage}">자세한 사용법 보기</a>
            </div>
            <div class="hero-trust">
              <span>원하는 천체에 맞춘 가장 좋은 시간대 확인</span>
              <span>카카오맵 API를 활용한 쉬운 지명 검색</span>
            </div>
          </div>

          <aside class="hero-card stat-card">
            <div class="chatgpt-shell" aria-label="ChatGPT 사용 예시 화면">
              <div class="chatgpt-topbar">
                <div class="chatgpt-brand">
                  <div class="chatgpt-menu" aria-hidden="true">
                    <span></span>
                    <span></span>
                  </div>
                  <div class="chatgpt-dot" aria-hidden="true"></div>
                  <div class="chatgpt-title">
                    <strong>ChatGPT</strong>
                  </div>
                </div>
                <div class="chatgpt-icons" aria-hidden="true">
                  <div class="chatgpt-icon">⌁</div>
                  <div class="chatgpt-icon">◎</div>
                </div>
              </div>

              <div class="chatgpt-stage">
                <div class="chatgpt-thread">
                  <div class="chatgpt-message">
                    <div class="chatgpt-label">사용자</div>
                    <div class="chatgpt-user">내일 밤 11시에 육백마지기에서 은하수 촬영 괜찮을까?</div>
                  </div>

                  <div class="chatgpt-message">
                    <div class="chatgpt-label">mcp-darksky의 응답:</div>
                    <div class="chatgpt-tool">
                      <div class="chatgpt-tool-header">
                        <strong>score_night_sky</strong>
                        <span class="chatgpt-tool-chip">tool output</span>
                      </div>
                      <pre class="mcp-json">{
  "location": "육백마지기",
  "mode": "wide_field_milky_way",
  "overall_score": 78.4,
  "score_curve": [56, 61, 73, 81],
  "best_window": "01:00-03:00",
  "blocker_timeline": ["moonlight", "moonlight", "transparency"],
  "light_pollution": "estimated bortle 4.0-4.6"
}</pre>
                    </div>
                  </div>

                  <div class="chatgpt-message">
                    <div class="chatgpt-label">AI의 응답:</div>
                    <div class="chatgpt-assistant">
                      <p>11시에도 촬영 자체는 가능하지만, 그 시간만 보면 최적이라고 하긴 어렵습니다. 지금 결과에선 초반 점수가 56점대에서 시작하고, 자정 이후 61점 안팎으로 올라간 뒤 새벽 1시부터 3시 사이에 73점대에서 81점대까지 가장 좋게 형성됩니다. 그래서 육백마지기에서 은하수를 노린다면 11시에 바로 본촬영에 들어가기보다는, 현장 도착 후 대기하면서 새벽 구간을 메인 시간대로 잡는 편이 훨씬 유리합니다.</p>
                      <p>왜 그렇게 보냐면, blocker timeline상 초반엔 달빛이 가장 큰 감점 요인이고, 뒤로 갈수록 대기 투명도가 더 중요한 변수로 넘어가기 때문입니다. 광해 추정은 보틀 4.0~4.6 수준이라 은하수 자체는 충분히 노려볼 만하고, best window도 01:00~03:00으로 잡혀 있습니다. 한 줄로 정리하면, 11시는 출발해도 되는 시간이고 실제 촬영은 1시 이후를 노리는 쪽이 더 좋습니다 <span class="assistant-truncate"> ...</span></p>
                    </div>
                  </div>
                </div>

                <div class="chatgpt-composer">
                  <div class="chatgpt-input">
                    <div class="chatgpt-placeholder">무엇이든 물어보세요</div>
                    <div class="chatgpt-input-row">
                      <div class="chatgpt-input-tools">
                        <div class="chatgpt-round">+</div>
                        <div class="chatgpt-round">◎</div>
                        <span>생각 중</span>
                      </div>
                      <div class="chatgpt-send">◉</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section class="section" id="connect">
        <div class="shell">
          <div class="section-header">
            <div class="section-label">바로 연결</div>
            <h2>ChatGPT에 붙이면 바로 쓸 수 있습니다</h2>
            <p>첫 화면에서는 연결과 가치만 빠르게 보여주고, 자세한 사용법은 별도 페이지에서 이어서 볼 수 있게 정리했습니다.</p>
          </div>

          <div class="grid grid-2">
            <article class="panel content-card">
              <span class="feature-kicker">MCP 연결</span>
              <h3>ChatGPT 연결 주소</h3>
              <p class="copy">이 주소를 custom MCP connector에 넣으면 바로 연결됩니다. 연결 후에는 장소명만으로도 바로 물어볼 수 있습니다.</p>
              <input class="endpoint-box" value="${endpoint}" readonly id="mcp-endpoint" />
              <div class="card-actions">
                <button type="button" class="button button-primary" data-copy="#mcp-endpoint">MCP 주소 복사</button>
              </div>
            </article>

            <article class="panel content-card">
              <span class="feature-kicker">자세히 보기</span>
              <h3>프롬프트와 사용법 페이지</h3>
              <p class="copy">설정 전에 구조를 먼저 보고 싶다면 이 페이지에서 프롬프트, 예시 질문, 연결 흐름을 한 번에 볼 수 있습니다.</p>
              <input class="endpoint-box" value="${promptPage}" readonly id="prompt-page" />
              <div class="card-actions">
                <button type="button" class="button button-secondary" data-copy="#prompt-page">링크 복사</button>
                <a class="button button-secondary" href="${promptPage}">자세히 보기</a>
              </div>
            </article>
          </div>

          <div class="glass-strip">
            <div class="panel">
              <strong>오늘 나가도 되는지</strong>
              <p class="muted">점수 하나가 아니라 밤 전체 흐름을 보여주므로, 지금 출발해도 되는지 바로 판단하기 쉽습니다.</p>
            </div>
            <div class="panel">
              <strong>몇 시가 가장 좋은지</strong>
              <p class="muted">best window와 blocker timeline으로, 좋은 시간대와 감점 원인을 시간대별로 바로 볼 수 있습니다.</p>
            </div>
            <div class="panel">
              <strong>무엇이 문제인지</strong>
              <p class="muted">달빛인지, 투명도인지, 광해인지 구분해서 설명하므로 초보자도 원인을 이해하기 쉽습니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="shell">
          <div class="section-header">
            <div class="section-label">사용 예시:</div>
            <h2>막연한 계획을 바로 실행 가능한 정보로</h2>
            <p>밤하늘 점수, 시간대별 흐름, 광해 추정, 타깃 고도를 함께 엮어 실제 출사 판단으로 돌려줍니다.</p>
          </div>
          <ol class="steps">
            <li class="panel step">
              <div class="step-number">1</div>
              <div>
                <h3>이날 밤 여기서 찍어도 될까?</h3>
                <p>장소와 시간만 말하면 당시의 밤하늘 예보를를 기준으로 가능 여부와 가장 좋은 시간을 바로 계산합니다.</p>
              </div>
            </li>
            <li class="panel step">
              <div class="step-number">2</div>
              <div>
                <h3>은하수는 몇 시가 좋은가?</h3>
                <p>초반엔 달빛, 새벽엔 투명도... 감점 요인이 바뀌는 흐름까지 같이 보여줘서 시간 선택이 쉬워집니다.</p>
              </div>
            </li>
            <li class="panel step">
              <div class="step-number">3</div>
              <div>
                <h3>딥스카이까지 가능한가?</h3>
                <p>광해 추정, 모드별 점수, 타깃 고도까지 함께 계산하므로로 단순 날씨 확인보다 훨씬 실전적인 판단이 가능합니다.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section class="section">
        <div class="shell">
          <div class="section-header">
            <div class="section-label">핵심 구현</div>
            <h2>필요하면 API와 장기 예보도 함께 붙일 수 있습니다</h2>
            <p>첫 화면은 광고 중심으로 두고, 실제 연결과 검증은 아래 샘플 URL로 바로 테스트할 수 있게 남겨뒀습니다.</p>
          </div>
          <div class="grid grid-3">
            <article class="panel feature-card">
              <span class="feature-kicker">좌표 기반 API</span>
              <h3>좌표로 바로 조회</h3>
              <p class="copy">위도, 경도, 날짜만 있으면 구조화된 점수 결과를 JSON으로 받을 수 있습니다.</p>
              <pre id="api-example">${apiExample}</pre>
              <div class="card-actions">
                <button type="button" class="button button-secondary" data-copy="#api-example">예시 복사</button>
              </div>
            </article>

            <article class="panel feature-card">
              <span class="feature-kicker">장소명 기반 API</span>
              <h3>장소명으로 조회</h3>
              <p class="copy">카카오 Local API 키가 설정되어 있으면 한국 장소명만으로 좌표를 해석해서 조회할 수 있습니다.</p>
              <pre id="place-api-example">${placeApiExample}</pre>
              <div class="card-actions">
                <button type="button" class="button button-secondary" data-copy="#place-api-example">예시 복사</button>
              </div>
            </article>

            <article class="panel feature-card">
              <span class="feature-kicker">장기 예보 API</span>
              <h3>먼 날짜는 간단 모드로 확인</h3>
              <p class="copy">6일 이후 날짜는 false precision을 줄이기 위해 full detail 대신 단순화된 outlook 응답으로 안내합니다.</p>
              <pre id="outlook-example">${outlookExample}</pre>
              <div class="card-actions">
                <button type="button" class="button button-secondary" data-copy="#outlook-example">예시 복사</button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <div class="footer-note shell">
        mcp-darksky는 Open-Meteo 예보, 천문 계산, 한국형 광해 추정, 타깃 고도 분석을 조합해 밤하늘 촬영 판단을 돕습니다.
      </div>
    </div>
    <div class="toast" id="toast">복사했습니다.</div>
    ${buildSharedScript()}
  </body>
</html>`;
}

export function buildHomePage({ publicBaseUrl }) {
  const sampleDate = getSuggestedForecastDate("Asia/Seoul");
  const coordinateExample = `${publicBaseUrl}/api/score?latitude=37.6229&longitude=128.7391&date=${sampleDate}&mode=wide_field_milky_way`;
  const placeExample = `${publicBaseUrl}/api/score?place_query=%EC%95%88%EB%B0%98%EB%8D%B0%EA%B8%B0%EB%A7%88%EC%9D%84&date=${sampleDate}`;

  return `<!doctype html>
<html lang="ko">
  <head>
    ${buildSharedHead({ title: "mcp-darksky" })}
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <canvas class="stars" id="hero-stars" aria-hidden="true"></canvas>
        <div class="shell hero-grid">
          <div class="hero-copy">
            <h1>밤하늘 촬영 판단을<br />구조화된 점수로 받으세요.</h1>
            <p class="hero-subtitle">
              mcp-darksky는 구름, 달빛, 결로, 광해, 타깃 고도와 시간대별 흐름까지 묶어서
              <strong>밤하늘 촬영 가능성</strong>을 구조화된 결과로 반환합니다.
            </p>
            <div class="hero-actions">
              <a class="button button-primary" href="${publicBaseUrl}/install">설치 안내 보기</a>
              <a class="button button-secondary" href="${publicBaseUrl}/prompt">프롬프트로 먼저 써보기</a>
            </div>
          </div>

          <aside class="panel hero-card">
            <div class="preview-list">
              <div class="preview-item">
                <strong>입력</strong>
                <p>장소명, 날짜, 촬영 모드, 타깃 이름</p>
              </div>
              <div class="preview-item">
                <strong>출력</strong>
                <p>overall score, score curve, best windows, blocker timeline, 광해 추정, 타깃 고도</p>
              </div>
              <div class="preview-item">
                <strong>활용</strong>
                <p>ChatGPT 연결, 내부 툴, JSON API, 설치용 링크 페이지</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section class="section">
        <div class="shell">
          <div class="section-header">
            <h2>현재 바로 열려 있는 입구</h2>
            <p>MCP를 붙이는 사용자와, 링크만 받고 바로 써보는 사용자 모두를 위한 경로가 준비되어 있습니다.</p>
          </div>

          <div class="grid grid-2">
            <article class="panel content-card">
              <span class="feature-kicker">MCP 주소</span>
              <h3>원격 MCP 주소</h3>
              <pre>${publicBaseUrl}/mcp</pre>
            </article>

            <article class="panel content-card">
              <span class="feature-kicker">프롬프트 링크</span>
              <h3>설정이 어려운 사용자를 위한 링크</h3>
              <pre>${publicBaseUrl}/prompt</pre>
            </article>

            <article class="panel content-card">
              <span class="feature-kicker">좌표 기반 API</span>
              <h3>좌표 기반 JSON</h3>
              <pre>${coordinateExample}</pre>
            </article>

            <article class="panel content-card">
              <span class="feature-kicker">장소명 기반 API</span>
              <h3>한국 장소명 기반 JSON</h3>
              <pre>${placeExample}</pre>
            </article>
          </div>
        </div>
      </section>

      <div class="footer-note shell">
        설치 링크가 필요하다면 <a href="${publicBaseUrl}/install">/install</a> 페이지를 그대로 공유하면 됩니다.
      </div>
    </div>
    <div class="toast" id="toast">복사했습니다.</div>
    ${buildSharedScript()}
  </body>
</html>`;
}
