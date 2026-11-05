import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 검증용 빌드가 내 개발 서버의 .next 폴더를 건드리지 않게, 환경변수로 출력 폴더를 바꿀 수 있다.
  distDir: process.env.RECALLNOTE_DIST_DIR ?? ".next",
  // 보안 헤더: 다른 사이트가 이 앱을 보이지 않는 액자(iframe)에 넣어 클릭을 훔치는 것(클릭재킹)을 막는다.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
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
