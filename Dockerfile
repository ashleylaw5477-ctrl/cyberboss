FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git imagemagick \
    && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
    && git config --global --add url."https://github.com/".insteadOf "git@github.com:" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm install --global @anthropic-ai/claude-code@latest \
    && mkdir -p /data/home /data/cyberboss /data/workspace

# Pin the Garden wake bridge so a future upstream change cannot silently alter
# a working Zeabur deployment.
RUN mkdir -p /opt/galatea-garden-wake-bridge \
    && curl -fsSL https://codeload.github.com/WenXiaoWendy/galatea-garden-wake-bridge/tar.gz/55a5ea2f3c295f8451d3e84fdfdaf54d681d5fbd \
       | tar -xz --strip-components=1 -C /opt/galatea-garden-wake-bridge \
    && cd /opt/galatea-garden-wake-bridge \
    && npm ci \
    && npm run build \
    && npm prune --omit=dev

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
