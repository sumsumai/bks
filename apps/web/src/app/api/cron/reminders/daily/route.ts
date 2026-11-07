import { cronAuthorized, sendDueReminders } from "@/lib/reminders";

/** Once-a-day scheduler (Vercel Hobby allows only daily crons): looks a full day further ahead. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("forbidden", { status: 403 });
  return Response.json(await sendDueReminders(24));
}
