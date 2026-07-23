FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci \
    && npm install --global @anthropic-ai/claude-code@latest \
    && mkdir -p /data/home /data/cyberboss /data/workspace

# Build the vendored Garden wake bridge without depending on private upstream
# repositories during Zeabur deployment.
RUN mkdir -p /opt/galatea-garden-wake-bridge \
    && cp -a /app/vendor/galatea-garden-wake-bridge/. /opt/galatea-garden-wake-bridge/ \
    && cd /opt/galatea-garden-wake-bridge \
    && npm ci \
    && npm run build \
    && npm prune --omit=dev

COPY . .
RUN npm run dashboard:build \
    && npm prune --omit=dev
COPY zeabur-entrypoint.sh /usr/local/bin/zeabur-entrypoint
RUN chmod +x /usr/local/bin/zeabur-entrypoint

ENV HOME=/data/home \
    CYBERBOSS_STATE_DIR=/data/cyberboss \
    CYBERBOSS_WORKSPACE_ROOT=/data/workspace \
    CYBERBOSS_RUNTIME=claudecode \
    CYBERBOSS_DASHBOARD_HOST=0.0.0.0 \
    CYBERBOSS_DASHBOARD_ENABLED=true \
    CYBERBOSS_ENABLE_LOCATION_SERVER=false \
    CYBERBOSS_AUTOSTART=false \
    DISABLE_AUTOUPDATER=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

ENTRYPOINT ["/usr/local/bin/zeabur-entrypoint"]
