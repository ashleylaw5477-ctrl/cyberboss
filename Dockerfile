FROM node:22-bookworm-slim

ARG FEEDLING_CONSUMER_REPO=https://github.com/teleport-computer/feedling-mcp.git
ARG FEEDLING_CONSUMER_REF=main

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        imagemagick \
        git \
        python3 \
        python3-pip \
        python3-venv \
        build-essential \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The resident consumer is always sourced from the official release branch.
# Keep this checkout separate from CyberBoss so identity/Memory files never get
# mixed into the consumer update path.
RUN git clone --depth 1 --branch "${FEEDLING_CONSUMER_REF}" "${FEEDLING_CONSUMER_REPO}" /opt/feedling-mcp \
    && test "$(git -C /opt/feedling-mcp rev-parse HEAD)" = "$(git -C /opt/feedling-mcp rev-parse "origin/${FEEDLING_CONSUMER_REF}")" \
    && python3 -m venv /opt/feedling-venv \
    && /opt/feedling-venv/bin/pip install --no-cache-dir -r /opt/feedling-mcp/tools/chat_resident_requirements.txt

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
    FEEDLING_RESIDENT_ENABLED=false \
    FEEDLING_CONSUMER_DIR=/opt/feedling-mcp \
    FEEDLING_CONSUMER_PYTHON=/opt/feedling-venv/bin/python \
    DISABLE_AUTOUPDATER=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

ENTRYPOINT ["/usr/local/bin/zeabur-entrypoint"]
