FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm install --global @anthropic-ai/claude-code@latest \
    && mkdir -p /data/home /data/cyberboss /data/workspace

COPY . .
COPY zeabur-entrypoint.sh /usr/local/bin/zeabur-entrypoint
RUN chmod +x /usr/local/bin/zeabur-entrypoint

ENV HOME=/data/home \
    CYBERBOSS_STATE_DIR=/data/cyberboss \
    CYBERBOSS_WORKSPACE_ROOT=/data/workspace \
    CYBERBOSS_RUNTIME=claudecode \
    CYBERBOSS_ENABLE_LOCATION_SERVER=false \
    CYBERBOSS_AUTOSTART=false \
    DISABLE_AUTOUPDATER=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

ENTRYPOINT ["/usr/local/bin/zeabur-entrypoint"]
