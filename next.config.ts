import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * Expone los bindings de Cloudflare (Hyperdrive, secretos) durante `next dev`.
 * Sin esto, en desarrollo `getCloudflareContext()` no encuentra nada y la DB
 * cae al `DATABASE_URL` de `.env.local` — que es justo el comportamiento que
 * queremos para trabajar sin Wrangler.
 */
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // standalone => imagen Docker mínima para VPS / Railway / Render.
  // Se conserva a propósito: es la salida a cualquier host con proceso
  // persistente si Cloudflare deja de convenir.
  output: "standalone",
  serverExternalPackages: ["pg"],
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
