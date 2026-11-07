import { userRoute } from "@/lib/api";
import { membershipsOf } from "@/lib/tenant";

export const GET = userRoute(async (_req, user) => {
  const ms = await membershipsOf(user.id);
  return {
    user,
    businesses: ms.map((m) => ({ id: m.business.id, name: m.business.name, slug: m.business.slug, tier: m.business.tier, role: m.role, brandColor: m.business.brandColor, timezone: m.business.timezone, currency: m.business.currency })),
  };
});
