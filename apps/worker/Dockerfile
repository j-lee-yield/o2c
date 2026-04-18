FROM node:22-alpine AS base
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install
RUN pnpm --filter @o2c/worker build

CMD ["pnpm", "--filter", "@o2c/worker", "dev"]

