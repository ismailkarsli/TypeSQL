FROM --platform=linux/amd64 ghcr.io/pnpm/pnpm:12.11.2@sha256:fd95b696aff515e5c58f59248435c29d783fce85cfc9a28c9db3b994bffa44dd AS pnpm
FROM --platform=linux/amd64 oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS bun
FROM --platform=linux/amd64 node:26.8.1-bookworm@sha256:9f94d34c787165dca03b74e5bf9c3bf90e8de79b19aa3d87fe1fa1694bf75c89
COPY --from=pnpm /opt/pnpm /opt/pnpm
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV PATH="/opt/pnpm:$PATH" TZ=UTC LANG=C.UTF-8 LC_ALL=C.UTF-8 CI=true
WORKDIR /checkout
COPY . .
RUN pnpm --version && pnpm install --frozen-lockfile && pnpm --dir tests install --frozen-lockfile && pnpm --dir tests run typecheck
ENTRYPOINT ["pnpm", "--dir", "tests", "exec", "vitest", "run"]
