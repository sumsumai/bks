/** Platform staff roles and what each can do in /admin. Business roles live in rbac.ts. */
export const PLATFORM_ROLES = ["admin", "operator", "support", "finance", "moderator"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type PlatformPermission =
  | "overview.view"
  | "businesses.view"
  | "businesses.manage" // publish, suspend, edit, members, agent controls
  | "users.view"
  | "users.manage" // create, edit, reset password, disable, sessions, memberships
  | "staff.manage" // grant / revoke platform roles
  | "impersonate"
  | "plans.manage" // pricing and entitlements
  | "billing.view"
  | "billing.manage" // change a business's plan / subscription
  | "settings.manage" // platform settings, AI keys, Stripe
  | "channels.manage" // Telegram bot, WhatsApp gateway sessions
  | "agents.manage"
  | "community.moderate"
  | "audit.view";

const ALL: PlatformPermission[] = [
  "overview.view", "businesses.view", "businesses.manage", "users.view", "users.manage", "staff.manage", "impersonate",
  "plans.manage", "billing.view", "billing.manage", "settings.manage", "channels.manage", "agents.manage", "community.moderate", "audit.view",
];

export const ROLE_INFO: Record<PlatformRole, { label: string; description: string; permissions: PlatformPermission[] }> = {
  admin: { label: "Administrator", description: "Full control, including settings, pricing and staff access.", permissions: ALL },
  operator: {
    label: "Operator",
    description: "Runs day-to-day operations: businesses, users, agents and channels. No pricing, settings or staff access.",
    permissions: ["overview.view", "businesses.view", "businesses.manage", "users.view", "users.manage", "impersonate", "billing.view", "channels.manage", "agents.manage", "community.moderate", "audit.view"],
  },
  support: {
    label: "Support",
    description: "Helps customers: can look at everything tenant-related and sign in as a user. Read-only otherwise.",
    permissions: ["overview.view", "businesses.view", "users.view", "impersonate", "billing.view", "audit.view"],
  },
  finance: { label: "Finance", description: "Plans, pricing, subscriptions and payments.", permissions: ["overview.view", "businesses.view", "billing.view", "billing.manage", "plans.manage", "audit.view"] },
  moderator: { label: "Moderator", description: "VIP community moderation only.", permissions: ["community.moderate"] },
};

export const PERMISSION_LABEL: Record<PlatformPermission, string> = {
  "overview.view": "See platform overview",
  "businesses.view": "See businesses",
  "businesses.manage": "Manage businesses",
  "users.view": "See users",
  "users.manage": "Manage users & memberships",
  "staff.manage": "Grant platform access",
  impersonate: "Sign in as a user",
  "plans.manage": "Edit plans & pricing",
  "billing.view": "See subscriptions & payments",
  "billing.manage": "Change subscriptions",
  "settings.manage": "Edit platform settings",
  "channels.manage": "Manage Telegram & WhatsApp",
  "agents.manage": "Control AI agents",
  "community.moderate": "Moderate the community",
  "audit.view": "Read the audit log",
};

export const isPlatformRole = (r: unknown): r is PlatformRole => typeof r === "string" && (PLATFORM_ROLES as readonly string[]).includes(r);

export function platformCan(role: string | null | undefined, p: PlatformPermission) {
  return isPlatformRole(role) && ROLE_INFO[role].permissions.includes(p);
}
