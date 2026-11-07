import { cronAuthorized, sendDueReminders } from "@/lib/reminders";

/** Frequent scheduler (every 10–15 minutes): Docker cron service, Vercel Pro cron, any external cron. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("forbidden", { status: 403 });
  return Response.json(await sendDueReminders(2));
}
