import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Configuración del adaptador de Cloudflare.
 *
 * Sin caché incremental a propósito: todas las rutas del CRM son dinámicas
 * (`force-dynamic`) porque muestran conversaciones en vivo. Cachear aquí sería
 * servir mensajes viejos.
 */
export default defineCloudflareConfig();
