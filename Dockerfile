# Dockerfile for plexus-gamma development + test environment
#
# BUILD (from the plexus-gamma directory):
#
#   docker buildx build \
#     --build-context plexus-rpc-ts=../plexus-rpc-ts \
#     -t plexus-gamma .
#
# RUN tests (substrate auto-started by entrypoint):
#   docker run --rm plexus-gamma
#
# Interactive shell:
#   docker run --rm -it plexus-gamma bash

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# ─── System packages ────────────────────────────────────────────────────────

RUN apt-get update && apt-get install -y --no-install-recommends \
    # Essentials
    curl wget ca-certificates unzip \
    # Playwright / Chromium system deps
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo-gobject2 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libepoxy0 \
    libfontconfig1 \
    libfreetype6 \
    libgbm1 \
    libgdk-pixbuf-2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libharfbuzz0b \
    libjpeg-turbo8 \
    libnspr4 \
    libnss3 \
    libopus0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libpng16-16 \
    libsqlite3-0 \
    libvpx7 \
    libwayland-client0 \
    libwebp7 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcb-dri2-0 \
    libxcb-dri3-0 \
    libxcb-glx0 \
    libxcb-present0 \
    libxcb-randr0 \
    libxcb-render0 \
    libxcb-shape0 \
    libxcb-shm0 \
    libxcb-sync1 \
    libxcb-xfixes0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxinerama1 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxt6 \
    libxtst6 \
    fonts-liberation \
    # Firefox additional deps
    libdbus-glib-1-2 \
    libice6 \
    libsm6 \
    && rm -rf /var/lib/apt/lists/*

# ─── Bun ────────────────────────────────────────────────────────────────────

ENV BUN_INSTALL=/usr/local/bun
ENV PATH=/usr/local/bun/bin:$PATH

RUN curl -fsSL https://bun.sh/install \
    | bash -s -- bun-v1.3.5 \
    && bun --version

# ─── JS app ─────────────────────────────────────────────────────────────────

WORKDIR /app

# plexus-rpc-ts sits at ../plexus-rpc-ts relative to the app in dev;
# inside the image we place it at /plexus-rpc-ts so the file: ref resolves.
COPY --from=plexus-rpc-ts . /plexus-rpc-ts/

COPY . /app/

# Repoint the file: dependency to the in-image path
RUN sed -i 's|"file:../plexus-rpc-ts"|"file:/plexus-rpc-ts"|g' package.json \
    && bun install

# Install Playwright browser binaries + OS deps
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

RUN bunx playwright install chromium firefox \
    && bunx playwright install-deps chromium firefox

# ─── Entrypoint ─────────────────────────────────────────────────────────────

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8081

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "run", "test"]
