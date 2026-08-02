import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone => imagen Docker mínima para VPS / Railway / Render
  output: "standalone",
  serverExternalPackages: ["postgres"],
  /**
   * Solo afecta a `next dev`. Sin esto, abrir el panel por la IP de la LAN
   * (probar desde el celular) se trata como cross-origin: se bloquean los
   * assets de desarrollo, la página no hidrata y los formularios se mandan
   * como GET nativo. Añade aquí tu IP si el router te da otra.
   */
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.1.73"],
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
