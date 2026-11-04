import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 검증용 빌드가 내 개발 서버의 .next 폴더를 건드리지 않게, 환경변수로 출력 폴더를 바꿀 수 있다.
  distDir: process.env.RECALLNOTE_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
