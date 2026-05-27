# Kappan 公式 Docker イメージ
#
# 運用ルール：
#   - 基本タグ（このファイル）は Node 20 + Java 17 + EPUBCheck + 公式テーマ/プラグインを含む
#   - フォント・大規模辞書（kuromoji.js 用 IPAdic、Noto Serif JP 等）は別タグ `:0.1-fonts` `:0.1-full`
#   - 基本タグのサイズ目標は ≤ 1 GB、フルタグ ≤ 3 GB
#
# ビルド例：
#   docker build -t ghcr.io/kappan/build:0.1 -f tools/docker/Dockerfile .
#
# 利用例：
#   docker run --rm -v "$PWD:/work" -w /work ghcr.io/kappan/build:0.1 \
#     kappan build --config kappan.config.ts --validate

FROM node:20-bookworm-slim AS base

# Java 17 (EPUBCheck) と最小ユーティリティ
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openjdk-17-jre-headless \
      ca-certificates \
      curl \
      unzip \
      git && \
    rm -rf /var/lib/apt/lists/*

# Corepack で pnpm を有効化
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# 非 root ユーザー
RUN useradd --create-home --shell /bin/bash kappan
WORKDIR /home/kappan

# --- ビルド段階 ---
FROM base AS build

WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages packages
COPY tools tools

RUN pnpm install --frozen-lockfile && \
    pnpm -r build

# EPUBCheck を事前取得（オフラインモードのため）
ENV KAPPAN_TOOLS_DIR=/opt/kappan
RUN pnpm epubcheck:fetch

# --- ランタイム段階 ---
FROM base AS runtime

ENV KAPPAN_TOOLS_DIR=/opt/kappan
ENV KAPPAN_OFFLINE_PREPARED=1

COPY --from=build /opt/kappan /opt/kappan
COPY --from=build /build /opt/kappan-source

# グローバル kappan コマンドの導通
RUN ln -s /opt/kappan-source/packages/cli/dist/bin.js /usr/local/bin/kappan && \
    chmod +x /usr/local/bin/kappan

USER kappan
WORKDIR /work

ENTRYPOINT ["kappan"]
CMD ["--help"]
