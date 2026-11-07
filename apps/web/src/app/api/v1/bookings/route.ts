import { z } from "zod";
import { body, query, tenantRoute } from "@/lib/api";
import { createBooking } from "@/lib/bookings";
import { listBookings } from "@/lib/queries";

const Create = z.object({
  serviceId: z.string(),
  staffId: z.string().nullish(),
  startsAt: z.iso.datetime(),
  customerId: z.string().optional(),
  customer: z.object({ name: z.string().min(1), email: z.string().nullish(), phone: z.string().nullish() }).optional(),
  notes: z.string().max(1000).optional(),
  override: z.boolean().optional(),
});

export const GET = tenantRoute("bookings.view", async (req, t) => {
  const q = query(req);
  const status = q.get("status")?.split(",").filter(Boolean) as any;
  return {
    bookings: await listBookings(t.business.id, {
      from: q.get("from") ? new Date(q.get("from")!) : undefined,
      to: q.get("to") ? new Date(q.get("to")!) : undefined,
      status,
      customerId: q.get("customerId") ?? undefined,
    }),
  };
});

export const POST = tenantRoute("bookings.manage", async (req, t) => {
  const input = await body(req, Create);
  const customer = input.customerId ? { id: input.customerId } : input.customer;
  if (!customer) throw new (await import("@/lib/errors")).AppError(422, "validation_failed", "customer or customerId is required");
  const { booking } = await createBooking(
    t.business,
    { serviceId: input.serviceId, staffId: input.staffId, startsAt: input.startsAt, customer, source: "owner", notes: input.notes, override: input.override },
    { type: "user", id: t.user.id },
  );
  return Response.json({ booking: { ...booking, manageToken: undefined } }, { status: 201 });
});
