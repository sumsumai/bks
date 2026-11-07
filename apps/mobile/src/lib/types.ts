// Response shapes of the BKS web API (/api/v1). Dates arrive as ISO strings over JSON.

export type Role = "owner" | "manager" | "staff";
export type Tier = "standard" | "vip";

export type User = { id: string; email: string; name: string; platformRole: "admin" | null };

export type BusinessSummary = {
  id: string;
  name: string;
  slug: string;
  tier: Tier;
  role: Role;
  brandColor: string;
  timezone: string;
  currency: string;
};

export type Me = { user: User; businesses: BusinessSummary[] };

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type BookingSource = "web" | "owner" | "agent" | "whatsapp" | "telegram";

export type BookingRow = {
  id: string;
  businessId: string;
  customerId: string;
  serviceId: string;
  staffId: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  source: BookingSource;
  priceCents: number;
  paymentStatus: "unpaid" | "pending" | "paid" | "refunded";
  notes: string;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  service: { id: string; name: string; durationMinutes: number };
  staff: { id: string; name: string; color: string };
  customer: { id: string; name: string; phone: string | null; email: string | null };
};

export type Metrics = {
  days: number;
  bookings: number;
  revenueCents: number;
  upcoming: number;
  upcomingRevenueCents: number;
  agentBookings: number;
  cancellations: number;
  noShows: number;
  conversations: number;
  escalated: number;
  openEscalations: number;
  resolutionRate: number | null;
  agentTurns: number;
  avgLatencyMs: number;
  tokens: number;
  pendingApprovals: number;
  actionsExecuted: number;
  actionsFailed: number;
  customers: number;
  newCustomers: number;
  daily: { day: string; bookings: number; revenueCents: number }[];
};

export type ActionStatus = "executed" | "pending_approval" | "approved" | "rejected" | "failed" | "expired";

export type AgentAction = {
  id: string;
  businessId: string;
  agentId: string;
  conversationId: string | null;
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  status: ActionStatus;
  summary: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  customerName?: string | null;
  channel?: Channel | null;
};

export type Counts = { notifications: number; approvals: number; escalations: number };

export type Dashboard = { metrics: Metrics; today: BookingRow[]; approvals: AgentAction[]; counts: Counts };

export type Channel = "whatsapp" | "telegram" | "web";
export type ConversationStatus = "open" | "escalated" | "closed";

export type Conversation = {
  id: string;
  businessId: string;
  customerId: string | null;
  channel: Channel;
  externalThreadId: string;
  status: ConversationStatus;
  humanTakeover: boolean;
  escalationReason: string | null;
  summary: string;
  lastMessageAt: string;
  createdAt: string;
};

export type ConversationListItem = Conversation & {
  customer: { id: string; name: string } | null;
  lastMessage: string | null;
  lastRole: MessageRole | null;
};

export type MessageRole = "customer" | "agent" | "owner" | "system";
export type Message = { id: string; conversationId: string; role: MessageRole; content: string; authorUserId: string | null; createdAt: string };

export type Customer = { id: string; name: string; email: string | null; phone: string | null; notes: string };

export type ConversationDetail = Conversation & { customer: Customer | null; messages: Message[]; actions: AgentAction[] };

export type Tone = "warm" | "professional" | "playful" | "luxury" | "concise";
export type Persona = { tone: Tone; language: string; formality: "casual" | "neutral" | "formal"; emoji: boolean; greeting: string; signature: string };
export type ToolMode = "auto" | "approve" | "off";

export type Agent = {
  id: string;
  name: string;
  status: "provisioning" | "active" | "paused" | "error";
  persona: Persona;
  instructions: string;
  permissions: Record<string, ToolMode>;
  model: string;
  escalationKeywords: string;
  provisionedAt: string | null;
};

export type AgentTool = { name: string; label: string; mode: ToolMode; locked: boolean };
export type ChannelInfo = {
  id: string;
  kind: Channel;
  status: "connected" | "pairing" | "disconnected" | "error";
  displayName: string;
  publicHandle: string | null;
  mode: string | null;
  pairing: { qr?: string; code?: string; phone?: string; at: string } | null;
  lastError: string | null;
};
export type AgentView = { agent: Agent; tools: AgentTool[]; channels: (ChannelInfo | null)[]; metrics?: Metrics };

export type KnowledgeKind = "faq" | "policy" | "document" | "note";
export type KnowledgeItem = { id: string; kind: KnowledgeKind; title: string; content: string; source: string; updatedAt: string };

export type Policy = {
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  cancellationWindowHours: number;
  slotIntervalMinutes: number;
  autoConfirm: boolean;
  requirePayment: boolean;
  policyText: string;
};

export type Business = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  timezone: string;
  currency: string;
  brandColor: string;
  policy: Policy;
  tier: Tier;
  published: boolean;
  suspended: boolean;
};

export type Service = {
  id: string;
  name: string;
  description: string;
  category: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
  active: boolean;
  sortOrder: number;
  staffIds: string[];
};

export type Hours = { weekday: number; startMinute: number; endMinute: number };
export type Staff = { id: string; name: string; title: string; bio: string; color: string; active: boolean; hours: Hours[] };

export type Notification = { id: string; kind: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string };

export type Slot = { startsAt: string; time: string; staffIds: string[] };
