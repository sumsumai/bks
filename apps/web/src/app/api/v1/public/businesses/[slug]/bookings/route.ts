import { z } from "zod";
import { body, publicRoute } from "@/lib/api";
import { createBooking } from "@/lib/bookings";
import { rateLimit } from "@/lib/rate-limit";
import { businessForRequest } from "@/lib/public";

const Body = z.object({
  serviceId: z.string(),
  staffId: z.string().nullish(),
  startsAt: z.iso.datetime(),
  name: z.string().trim().min(1).max(80),
  email: z.email().max(200),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().max(1000).optional(),
  consent: z.literal(true, { message: "Please accept the privacy notice" }),
  marketingConsent: z.boolean().optional(),
});

export const POST = publicRoute(async (req, p) => {
  rateLimit(req, "public-booking", 10, 60_000);
  const input = await body(req, Body);
  const business = await businessForRequest(req, p.slug);
  const { booking, service, staff } = await createBooking(
    business,
    {
      serviceId: input.serviceId,
      staffId: input.staffId,
      startsAt: input.startsAt,
      customer: { name: input.name, email: input.email, phone: input.phone, marketingConsent: input.marketingConsent },
      source: "web",
      notes: input.notes,
    },
    { type: "customer" },
  );
  return Response.json(
    { booking: { id: booking.id, status: booking.status, startsAt: booking.startsAt, service: service.name, staff: staff.name, manageToken: booking.manageToken } },
    { status: 201 },
  );
});
