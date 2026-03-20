FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV HOST=0.0.0.0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY data ./data
COPY README.md ./

CMD ["node", "scripts/boot-railway.mjs"]
