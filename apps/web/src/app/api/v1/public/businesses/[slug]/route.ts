import { publicRoute } from "@/lib/api";
import { publicBusiness, publicProfile } from "@/lib/public";

export const GET = publicRoute(async (_req, p) => publicProfile(await publicBusiness(p.slug)));
