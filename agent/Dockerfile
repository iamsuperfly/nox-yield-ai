# =============================================================================
# Yield Fortress Optimizer — iExec Nox TDX-TEE image
#
# The image is consumed by the iExec workerpool (`tdx-labs.pools.iexec.eth`).
# The runtime contract is fixed by iExec:
#   • Inputs are mounted READ-ONLY at /iexec_in
#   • Outputs MUST be written to /iexec_out
#   • The container runs offline except for whitelisted egress (RPC + LLM)
# =============================================================================

FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY iexec_in ./iexec_in

RUN pnpm run build

# -----------------------------------------------------------------------------
FROM node:24-bookworm-slim

LABEL org.opencontainers.image.title="Yield Fortress Optimizer"
LABEL org.opencontainers.image.source="https://github.com/iamsuperfly/nox-yield-ai"
LABEL iexec.tee.framework="tdx"
LABEL iexec.app.kind="elizaos-agent"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY iexec_in ./iexec_in

# iExec mounts these at runtime — declared so the image is self-describing.
VOLUME ["/iexec_in", "/iexec_out"]

ENV NODE_ENV=production
ENV IEXEC_IN=/iexec_in
ENV IEXEC_OUT=/iexec_out

ENTRYPOINT ["node", "dist/index.js"]
