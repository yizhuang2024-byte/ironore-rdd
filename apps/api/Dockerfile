# 多階段建置 —— 正式部署用。
# 從 monorepo 根目錄建置：docker build -f apps/api/Dockerfile .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable
# Prisma 需要 openssl
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── 相依套件 ────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @ltc/api... --prod=false

# ── 建置 ────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# 產生 Prisma client（輸出至 apps/api/src/generated/prisma）
RUN pnpm --filter @ltc/api exec prisma generate
RUN pnpm --filter @ltc/api typecheck

# ── 執行 ────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production TZ=UTC

# 不以 root 執行
RUN groupadd -r ltc && useradd -r -g ltc -m ltc

COPY --from=build --chown=ltc:ltc /app /app
WORKDIR /app/apps/api
USER ltc

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 以 tsx 直接執行 TypeScript。若要改為預先編譯，
# 需先把 apps/api 的 build script 由 tsc --noEmit 改為實際輸出 dist。
CMD ["node", "--import", "tsx", "src/main.ts"]
