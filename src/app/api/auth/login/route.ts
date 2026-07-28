import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkCredentials,
  createSession,
  setSessionCookie,
} from "@/lib/auth/session";

const bodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  if (!checkCredentials(email, password)) {
    // Retardo fijo para no filtrar si el correo existe.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json(
      { error: "Correo o contraseña incorrectos" },
      { status: 401 }
    );
  }

  await setSessionCookie(await createSession(email));
  return NextResponse.json({ ok: true });
}
