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
        display: grid;
        gap: 10px;
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

      .assistant-report-table {
        margin: 0;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(17, 24, 39, 0.05);
        border: 1px solid rgba(17, 24, 39, 0.08);
        font-family: "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 12px;
        line-height: 1.7;
        white-space: pre-wrap;
        word-break: break-word;
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

      .details-overlay {
        position: fixed;
        inset: 0;
        z-index: 40;
        display: block;
        padding: 0;
        background:
          radial-gradient(circle at top right, rgba(167, 184, 255, 0.16), transparent 20%),
          linear-gradient(180deg, rgba(3, 5, 8, 0.92), rgba(3, 5, 8, 0.96));
        backdrop-filter: blur(14px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease;
      }

      .details-overlay.is-open {
        opacity: 1;
        pointer-events: auto;
      }

      .details-panel {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        overflow: auto;
        border-radius: 0;
        border: none;
        background:
          radial-gradient(circle at top right, rgba(167, 184, 255, 0.12), transparent 24%),
          radial-gradient(circle at 20% 18%, rgba(143, 175, 255, 0.1), transparent 26%),
          linear-gradient(180deg, rgba(10, 16, 32, 0.98), rgba(6, 11, 21, 0.98));
        box-shadow: none;
        transform: translateY(12px);
        transition: transform 220ms ease;
      }

      .details-overlay.is-open .details-panel {
        transform: translateY(0) scale(1);
      }

      .details-panel::-webkit-scrollbar {
        width: 10px;
      }

      .details-panel::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.16);
        border-radius: 999px;
      }

      .details-header {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 26px 28px 18px;
        background: linear-gradient(180deg, rgba(8, 13, 24, 0.96), rgba(8, 13, 24, 0.78));
        backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .details-header h2 {
        margin: 8px 0 8px;
        font-size: clamp(28px, 4vw, 42px);
        line-height: 1.06;
        letter-spacing: -0.04em;
      }

      .details-header p {
        margin: 0;
        max-width: 760px;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.65;
      }

      .details-close {
        width: 44px;
        min-width: 44px;
        height: 44px;
        padding: 0;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.04);
        color: var(--text);
        font-size: 18px;
      }

      .details-content {
        display: grid;
        gap: 18px;
        width: var(--content-width);
        margin: 0 auto;
        padding: 22px 0 40px;
      }

      .details-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .details-card {
        padding: 22px;
        border-radius: 24px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.03));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      .details-card h3 {
        margin: 8px 0 10px;
        font-size: 22px;
        letter-spacing: -0.03em;
      }

      .details-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.68;
        font-size: 15px;
      }

      .details-card ul {
        margin: 14px 0 0;
        padding-left: 18px;
        color: var(--muted-strong);
        display: grid;
        gap: 10px;
        line-height: 1.58;
      }

      .details-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--accent-green);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .details-kicker::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.7;
      }

      .details-wide {
        grid-column: 1 / -1;
      }

      .formula-block {
        margin-top: 16px;
        padding: 18px 20px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
        display: grid;
        gap: 10px;
      }

      .formula-block code {
        display: block;
        font-family: "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 13px;
        color: var(--text);
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.7;
      }

      .details-meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .details-meta .panel {
        padding: 14px 16px;
        border-radius: 18px;
      }

      .details-meta strong {
        display: block;
        margin-bottom: 6px;
        font-size: 13px;
        color: var(--muted-strong);
      }

      .details-meta span {
        display: block;
        font-size: 14px;
        line-height: 1.5;
        color: var(--muted);
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

        .details-grid,
        .details-meta {
          grid-template-columns: 1fr;
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

        .details-overlay {
          padding: 0;
        }

        .details-panel {
          width: 100vw;
          height: 100vh;
          max-height: 100vh;
        }

        .details-header,
        .details-content {
          padding-left: 18px;
          padding-right: 18px;
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

        function setPanelState(id, nextState) {
          const panel = document.getElementById(id);
          if (!panel) {
            return;
          }

          panel.classList.toggle("is-open", nextState);
          panel.setAttribute("aria-hidden", nextState ? "false" : "true");
          document.body.style.overflow = nextState ? "hidden" : "";
        }

        document.querySelectorAll(".details-overlay").forEach((panel) => {
          setPanelState(panel.id, false);
        });

        document.querySelectorAll("[data-open-panel]").forEach((button) => {
          button.addEventListener("click", () => {
            setPanelState(button.getAttribute("data-open-panel"), true);
          });
        });

        document.querySelectorAll("[data-close-panel]").forEach((button) => {
          button.addEventListener("click", () => {
            const targetId = button.getAttribute("data-close-panel");
            if (targetId) {
              setPanelState(targetId, false);
              return;
            }

            const panel = button.closest(".details-overlay");
            if (panel?.id) {
              setPanelState(panel.id, false);
            }
          });
        });

        document.querySelectorAll(".details-overlay").forEach((panel) => {
          panel.addEventListener("click", (event) => {
            if (event.target === panel) {
              setPanelState(panel.id, false);
            }
          });
        });

        document.addEventListener("keydown", (event) => {
          if (event.key !== "Escape") {
            return;
          }

          document.querySelectorAll(".details-overlay.is-open").forEach((panel) => {
            setPanelState(panel.id, false);
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
              <strong>mcp-darksky</strong>는 구름, 월광, 광해, 대기질 같은 핵심 요소를 한 번에 모아
              <strong>그 날의 가능성</strong>과 <strong>시간대별 점수 흐름</strong>까지 바로 정리합니다.
            </p>
            <div class="hero-actions">
              <a class="button button-primary" href="#connect">MCP 주소 확인하기</a>
              <button type="button" class="button button-secondary" data-open-panel="details-panel">자세히 보기</button>
            </div>
            <div class="hero-trust">
              <span>은하수와 딥스카이를 위한 시간대별 분석</span>
              <span>지명 검색부터 광해 추정까지 한 번에 연결</span>
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
                  <div class="chatgpt-icon">⌕</div>
                  <div class="chatgpt-icon">◌</div>
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
                      <p><strong>추천 시간</strong> 01:00-03:00이 가장 좋습니다.</p>
                      <p><strong>판단 이유</strong> 은하수 고도는 새벽으로 갈수록 유리하고, 23시는 달빛 영향이 남아 있어 본촬영보다는 이동과 장비 세팅 쪽이 더 알맞습니다. 구름은 적지만 초반보다 새벽 구간의 조건이 더 좋습니다.</p>
                      <pre class="assistant-report-table">| 시간대 | 점수 | 핵심 변수 |
| --- | --- | --- |
| 23:00 | 56 | 달빛 |
| 00:00 | 61 | 달빛 |
| 01:00 | 73 | 투명도 |
| 02:00 | 81 | 투명도 |</pre>
                      <p><strong>이번 계산에 반영한 요소</strong> 월령/달고도, 은하수 고도, 구름, 투명도, 이슬점 spread, 바람/안정도, 광해.</p>
                      <p><strong>필수 준비물</strong> 새벽 결로 가능성이 있으면 렌즈히터를 챙기고, 바람이 남아 있으면 무거운 삼각대를 우선하세요.</p>
                      <p><strong>숙련자 참고</strong> 광각 은하수라면 달빛이 빠진 뒤 1-3시에 노출을 몰아주고, 11시는 전경 구도와 장비 밸런스 확인 시간으로 쓰는 편이 안전합니다.</p>
                    </div>
                  </div>
                </div>

                <div class="chatgpt-composer">
                  <div class="chatgpt-input">
                    <div class="chatgpt-placeholder">무엇이든 물어보세요</div>
                    <div class="chatgpt-input-row">
                      <div class="chatgpt-input-tools">
                        <div class="chatgpt-round">+</div>
                        <div class="chatgpt-round">◌</div>
                        <span>생각 중</span>
                      </div>
                      <div class="chatgpt-send">●</div>
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
            <p>설치는 짧게, 이해는 쉽게. 처음 보는 사람도 바로 연결하고 필요한 기준만 빠르게 확인할 수 있게 정리했습니다.</p>
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
              <span class="feature-kicker">무엇을 보는지</span>
              <h3>데이터와 점수 기준을 먼저 확인하세요</h3>
              <p class="copy">어떤 정보를 가져오고, 점수가 어떻게 정해지며, 광해 등급이 어떤 데이터 기준으로 계산되는지 한 번에 볼 수 있습니다.</p>
              <input class="endpoint-box" value="점수 구성 · 광해 추정 · 촬영 모드 · outlook 기준" readonly id="details-summary" />
              <div class="card-actions">
                <button type="button" class="button button-secondary" data-open-panel="details-panel">자세히 보기</button>
              </div>
            </article>
          </div>

          <div class="glass-strip">
            <div class="panel">
              <strong>오늘 갈 만한 밤인지</strong>
              <p class="muted">점수 하나가 아니라 밤 전체 흐름을 보여주기 때문에 지금 출발해도 되는지 빠르게 판단하기 쉽습니다.</p>
            </div>
            <div class="panel">
              <strong>몇 시가 가장 좋은지</strong>
              <p class="muted">추천 시간, 판단 이유, 시간대별 점수 표, 계산에 반영한 요소, 필요 시 준비물, 숙련자 참고까지 한 번에 이어서 볼 수 있습니다.</p>
            </div>
            <div class="panel">
              <strong>무엇이 문제인지</strong>
              <p class="muted">월광인지, 투명도인지, 광해인지 구분해서 설명하므로 초보자도 원인을 이해하기 쉽습니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="shell">
          <div class="section-header">
            <div class="section-label">사용 예시</div>
            <h2>막연한 계획을 바로 실행 가능한 정보로</h2>
            <p>밤하늘 점수, 시간대별 흐름, 광해 추정, 목표 고도를 함께 읽어 실제 출사 판단으로 이어줍니다.</p>
          </div>
          <ol class="steps">
            <li class="panel step">
              <div class="step-number">1</div>
              <div>
                <h3>이날 밤 가도 되는가?</h3>
                <p>장소와 날짜만 말하면 즉시 그 밤의 기본 가능성과 가장 좋은 시간대를 계산합니다.</p>
              </div>
            </li>
            <li class="panel step">
              <div class="step-number">2</div>
              <div>
                <h3>어느 시간이 좋은가?</h3>
                <p>초반에는 달빛, 새벽에는 투명도처럼 감점 요인이 어떻게 바뀌는지도 함께 보여줍니다.</p>
              </div>
            </li>
            <li class="panel step">
              <div class="step-number">3</div>
              <div>
                <h3>딥스카이까지 가능한가?</h3>
                <p>광해 추정, 모드별 점수, 목표 고도까지 함께 계산해 단순 날씨 확인보다 훨씬 실전적인 판단을 제공합니다.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section class="section">
        <div class="shell">
          <div class="section-header">
            <div class="section-label">핵심 구현</div>
            <h2>필요하면 API와 로직 정보도 바로 확인할 수 있습니다</h2>
            <p>첫 화면은 광고 중심으로 두되, 연결 뒤 검증이 필요한 사람을 위해 바로 테스트할 수 있는 예시도 남겨뒀습니다.</p>
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
              <span class="feature-kicker">지명 기반 API</span>
              <h3>장소명으로 조회</h3>
              <p class="copy">카카오 Local API가 설정되어 있으면 한국 지명만으로 좌표를 해석해 조회할 수 있습니다.</p>
              <pre id="place-api-example">${placeApiExample}</pre>
              <div class="card-actions">
                <button type="button" class="button button-secondary" data-copy="#place-api-example">예시 복사</button>
              </div>
            </article>

            <article class="panel feature-card">
              <span class="feature-kicker">원거리 날짜 API</span>
              <h3>먼 날짜는 outlook로</h3>
              <p class="copy">6일 이후 날짜는 false precision을 줄이기 위해 full detail 대신 간단한 outlook 응답으로 전환됩니다.</p>
              <pre id="outlook-example">${outlookExample}</pre>
              <div class="card-actions">
                <button type="button" class="button button-secondary" data-copy="#outlook-example">예시 복사</button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <div class="footer-note shell">
        mcp-darksky는 Open-Meteo 예보, 천문 계산, 한국형 광해 추정, 목표 고도 분석을 조합해 밤하늘 촬영 판단을 돕습니다.
      </div>
    </div>
    <div class="details-overlay" id="details-panel" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="details-title">
      <div class="details-panel">
        <div class="details-header">
          <div>
            <div class="section-label">자세히</div>
            <h2 id="details-title">이 도구가 무엇을 보고 어떻게 점수를 만드는지</h2>
            <p>mcp-darksky는 오늘 밤 바로 쓸 수 있는 정보만 추려 AI에 넘기기 위해 만들어졌습니다. 예보, 천문 정보, 광해 추정, 목표 고도까지 한 번에 모아서 “지금 가도 되는지”와 “몇 시가 제일 좋은지”를 답합니다.</p>
          </div>
          <button type="button" class="details-close" data-close-panel="details-panel" aria-label="자세히 패널 닫기">✕</button>
        </div>

        <div class="details-content">
          <div class="details-grid">
            <article class="details-card">
              <span class="details-kicker">무엇을 가져오나요?</span>
              <h3>날씨, 공기질, 천문 정보를 함께 읽습니다</h3>
              <p>한 가지 예보만 보는 대신 밤하늘 촬영에 직접 영향을 주는 정보만 모아 씁니다.</p>
              <ul>
                <li>Open-Meteo에서 기온, 이슬점, 습도, 총운량과 저·중·고층 구름, 시정, 강수, 풍속과 돌풍을 가져옵니다.</li>
                <li>같은 흐름에서 PM2.5, PM10, dust, aerosol optical depth, AQI, 오존과 이산화질소를 받아 투명도 해석에 반영합니다.</li>
                <li>천문박명, 달의 고도와 조도, 은하수 중심부 가시성, 목표 고도와 airmass는 내부 천문 계산으로 바로 만듭니다.</li>
              </ul>
            </article>

            <article class="details-card">
              <span class="details-kicker">점수는 어떻게 정해지나요?</span>
              <h3>한 점수보다 밤 전체의 흐름을 보여줍니다</h3>
              <p>최종 점수는 다섯 하위 점수를 묶어 계산하고, 동시에 시간대별 score curve와 best window를 같이 만듭니다.</p>
              <div class="formula-block">
                <code>overall_score = w_cloud × cloud_score
+ w_transparency × transparency_score
+ w_darkness × darkness_score
+ w_dew × dew_risk_score
+ w_stability × stability_score</code>
                <code>mode_score = mode_weights(weather, darkness, target_altitude, moon_separation)</code>
                <code>best_window = argmax(avg(score_curve[t₀ ... tₙ]))</code>
              </div>
              <ul>
                <li>핵심 하위 점수는 cloud, transparency, darkness, dew risk, stability입니다.</li>
                <li>강수, 안개, 매우 낮은 시정 같은 조건은 hard fail로 따로 표시합니다.</li>
                <li>결과는 overall score 하나로 끝나지 않고 score curve, blocker timeline, best window, window rankings로 이어집니다.</li>
              </ul>
            </article>

            <article class="details-card">
              <span class="details-kicker">광해 등급</span>
              <h3>한국형 보정이 들어간 추정 Bortle-like 값입니다</h3>
              <p>광해는 NASA 야간조도 데이터를 바탕으로 추정한 Bortle-like 값으로 보여주며, 장소 비교와 시간대 해설에 바로 쓸 수 있도록 한국 기준 보정을 함께 적용합니다.</p>
              <ul>
                <li>NASA Black Marble annual VIIRS 제품인 VNP46A4와 VJ146A4의 2025년 snow-free composite(A2025001 계열)를 사용합니다.</li>
                <li>현재 광해 추정 방식은 <code>2026-03-19-continuous-bortle-v2-korea-calibrated</code> 버전입니다.</li>
                <li>결과는 공식 보틀 등급이 아니라 <code>estimated_bortle_center</code>와 <code>estimated_bortle_range</code> 형태의 추정값입니다.</li>
              </ul>
              <div class="details-meta">
                <div class="panel">
                  <strong>입력 데이터</strong>
                  <span>VNP46A4 / VJ146A4<br />2025 annual snow-free composite</span>
                </div>
                <div class="panel">
                  <strong>함께 보여주는 값</strong>
                  <span>한국 내 밝기·어두움 퍼센타일<br />regional glow와 confidence</span>
                </div>
                <div class="panel">
                  <strong>출력 형태</strong>
                  <span>중심값과 범위를 함께 보여줘 장소 간 비교와 AI 해설에 바로 쓸 수 있습니다.</span>
                </div>
              </div>
            </article>

            <article class="details-card">
              <span class="details-kicker">촬영 모드</span>
              <h3>같은 밤도 무엇을 찍느냐에 따라 해석이 달라집니다</h3>
              <p>달빛과 안정성, 목표 고도는 촬영 방식에 따라 중요도가 달라서 모드별 가중치를 따로 둡니다.</p>
              <ul>
                <li><code>wide_field_milky_way</code> · <code>wide_field_nightscape</code></li>
                <li><code>broadband_deep_sky</code> · <code>narrowband_deep_sky</code></li>
                <li><code>star_trail</code> · <code>general</code></li>
                <li>목표를 넣으면 달-목표 separation, 목표 고도, airmass까지 같이 계산해 “몇 시가 가장 좋은지”를 더 정확히 정리합니다.</li>
              </ul>
            </article>

            <article class="details-card details-wide">
              <span class="details-kicker">먼 날짜는 어떻게 처리하나요?</span>
              <h3>6일 이후는 상세 점수 대신 outlook로 전환합니다</h3>
              <p>먼 날짜에 시간별 점수를 너무 세밀하게 보여주면 오히려 잘못된 확신을 줄 수 있습니다. 그래서 가까운 날짜와 먼 날짜를 다르게 다룹니다.</p>
              <ul>
                <li>0일에서 5일 이내는 시간대별 score curve, blocker timeline, best window까지 상세하게 보여줍니다.</li>
                <li>6일 이후는 <code>score_night_sky_outlook</code> 경로로 전환해 블록 단위 전망과 핵심 해설만 남깁니다.</li>
                <li>즉, 가까운 날짜는 “정밀한 실행 판단”, 먼 날짜는 “거친 계획 수립”에 맞춰 설계되어 있습니다.</li>
              </ul>
            </article>
          </div>
        </div>
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
                <p>추천 시간, 이유 비교, 시간대별 점수 표, 계산 요소, 준비물, 숙련자 참고</p>
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
            <div class="section-label">촬영 모드</div>
            <h2>무엇을 찍느냐에 따라 보는 기준도 달라집니다</h2>
            <p>같은 밤이라도 촬영 목적이 다르면 중요한 변수도 달라집니다. 자주 쓰는 다섯 가지 모드를 빠르게 고를 수 있게 정리했습니다.</p>
          </div>

          <div class="grid grid-3">
            <article class="panel feature-card">
              <span class="feature-kicker">wide_field_milky_way</span>
              <h3>광각 은하수</h3>
              <p class="copy">달빛과 어둠, 은하수 코어 타이밍을 우선해서 봅니다.</p>
            </article>

            <article class="panel feature-card">
              <span class="feature-kicker">wide_field_nightscape</span>
              <h3>광각 야경</h3>
              <p class="copy">하늘과 지상을 함께 찍기 좋은 시간을 봅니다.</p>
            </article>

            <article class="panel feature-card">
              <span class="feature-kicker">broadband_deep_sky</span>
              <h3>광대역 딥스카이</h3>
              <p class="copy">어두운 하늘과 투명도, 타깃 고도를 중요하게 봅니다.</p>
            </article>
          </div>

          <div class="grid grid-2" style="margin-top: 18px;">
            <article class="panel feature-card">
              <span class="feature-kicker">narrowband_deep_sky</span>
              <h3>협대역 딥스카이</h3>
              <p class="copy">달빛보다 안정도와 타깃 고도에 더 강한 편입니다.</p>
            </article>

            <article class="panel feature-card">
              <span class="feature-kicker">star_trail</span>
              <h3>별궤적</h3>
              <p class="copy">긴 맑은 시간과 흔들림 적은 조건을 우선해서 봅니다.</p>
            </article>
          </div>
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

