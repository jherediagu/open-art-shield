# OpenArtShield self-hosted REST server.
#
# Build from the REPO ROOT (the workspace is the build context):
#   docker build -f packages/server/Dockerfile -t openartshield-server .
#   docker run --rm -p 8787:8787 openartshield-server
#
# The API is JSON over HTTP: GET /healthz, POST /v1/{embed,extract,verify,audit,optout}.

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@openartshield/server..." build
# Produce a standalone deployment (dist + production node_modules only).
RUN pnpm --filter @openartshield/server --prod deploy /out

FROM node:22-slim
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=build /out .
EXPOSE 8787
USER node
CMD ["node", "dist/index.js"]
