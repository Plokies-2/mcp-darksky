FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV MCP_TRANSPORT=http
ENV PYTHON_BIN=python3

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY requirements-runtime.txt ./
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
RUN pip install --no-cache-dir -r requirements-runtime.txt

COPY src ./src
COPY scripts ./scripts
COPY data ./data
COPY README.md ./

CMD ["node", "scripts/boot-railway.mjs"]
