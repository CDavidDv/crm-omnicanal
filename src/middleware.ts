import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Protege todo el panel. El webhook de Meta queda fuera a propósito: se
 * autentica con la firma X-Hub-Signature-256, no con sesión.
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/webhooks", "/api/health"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("crm_session")?.value;

  if (token) {
    try {
      const key = new TextEncoder().encode(process.env.SESSION_SECRET);
      await jwtVerify(token, key);
      return NextResponse.next();
    } catch {
      // Token vencido o alterado: cae al redirect.
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
