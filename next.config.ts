import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone => imagen Docker mínima para VPS / Railway / Render
  output: "standalone",
  serverExternalPackages: ["postgres"],
  images: {
    remotePatterns: [
      // CDN de media de Meta (fotos de perfil, adjuntos de Messenger/IG)
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "lookaside.fbsbx.com" },
    ],
  },
};

export default nextConfig;
