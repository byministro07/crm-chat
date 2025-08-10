export async function GET() {
  return Response.json({ ok: true, now: Date.now() });
}
