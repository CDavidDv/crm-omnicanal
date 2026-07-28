import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Para el uptime monitor. Si esto falla, no estás recibiendo mensajes. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: "up", ts: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "down", error: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }
}
