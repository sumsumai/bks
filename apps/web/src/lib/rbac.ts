export type BusinessRole = "owner" | "manager" | "staff";

export type Permission =
  | "business.manage" // profile, branding, policies, billing, members
  | "catalog.manage" // services, staff, availability, locations
  | "bookings.view"
  | "bookings.manage"
  | "customers.manage" // incl. GDPR export / erase
  | "agent.manage" // instructions, persona, permissions, knowledge, channels
  | "agent.approve" // approve / reject sensitive agent actions
  | "inbox.reply" // reply to customers, take over conversations
  | "analytics.view";

const MATRIX: Record<BusinessRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "business.manage",
    "catalog.manage",
    "bookings.view",
    "bookings.manage",
    "customers.manage",
    "agent.manage",
    "agent.approve",
    "inbox.reply",
    "analytics.view",
  ]),
  manager: new Set<Permission>([
    "catalog.manage",
    "bookings.view",
    "bookings.manage",
    "customers.manage",
    "agent.manage",
    "agent.approve",
    "inbox.reply",
    "analytics.view",
  ]),
  staff: new Set<Permission>(["bookings.view", "bookings.manage", "inbox.reply"]),
};

export const can = (role: BusinessRole, p: Permission) => MATRIX[role].has(p);
