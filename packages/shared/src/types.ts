import type {
  Channel,
  ConversationStatus,
  DomainStatus,
  MembershipStatus,
  Role,
  SenderType,
  SummaryStatus,
  ArticleStatus,
} from "./enums.js";

export interface WorkspaceDTO {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface MemberDTO {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  status: MembershipStatus;
  createdAt: string;
}

export interface ContactDTO {
  id: string;
  name: string | null;
  email: string | null;
}

export interface ConversationSummaryPayload {
  whatUserWants: string;
  whatsBeenTried: string;
  currentStatus: string;
}

export interface ConversationDTO {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  subject: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  contact: ContactDTO;
  lastMessageAt: string;
  snoozedUntil: string | null;
  summary: ConversationSummaryPayload | null;
  summaryStatus: SummaryStatus | null;
  summaryUpdatedAt: string | null;
  unreadCount: number;
  createdAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderType: SenderType;
  senderId: string | null;
  senderName: string | null;
  bodyHtml: string;
  bodyText: string;
  channel: Channel;
  emailDeliveryStatus: "SENT" | "FAILED" | null;
  readAt: string | null;
  createdAt: string;
}

export interface KbCategoryDTO {
  id: string;
  name: string;
  slug: string;
  order: number;
}

export interface KbArticleDTO {
  id: string;
  categoryId: string;
  categoryName?: string;
  title: string;
  slug: string;
  contentJson: unknown;
  contentHtml: string;
  status: ArticleStatus;
  updatedAt: string;
  excerpt?: string;
}

export interface DomainDTO {
  id: string;
  hostname: string;
  status: DomainStatus;
  verificationToken: string;
  verifiedAt: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  instructions: {
    txtRecordName: string;
    txtRecordValue: string;
    cnameTarget: string;
  };
}

// --- Socket.IO event payloads ---

export interface TypingPayload {
  conversationId: string;
  senderType: SenderType;
  senderName: string;
}

export interface PresencePayload {
  conversationId?: string;
  contactOnline?: boolean;
  agentIds?: string[];
}

export interface ReadReceiptPayload {
  conversationId: string;
  readAt: string;
  readBy: SenderType;
}

export interface ServerToClientEvents {
  "message:new": (msg: MessageDTO) => void;
  "message:read": (payload: ReadReceiptPayload) => void;
  "typing:start": (payload: TypingPayload) => void;
  "typing:stop": (payload: TypingPayload) => void;
  "presence:update": (payload: PresencePayload) => void;
  "conversation:updated": (conv: ConversationDTO) => void;
  "conversation:summary_updated": (payload: {
    conversationId: string;
    summary: ConversationSummaryPayload;
    summaryStatus: SummaryStatus;
    summaryUpdatedAt: string;
  }) => void;
}

export interface ClientToServerEvents {
  "conversation:join": (conversationId: string) => void;
  "conversation:leave": (conversationId: string) => void;
  "typing:start": (payload: { conversationId: string }) => void;
  "typing:stop": (payload: { conversationId: string }) => void;
  "message:read": (payload: { conversationId: string }) => void;
}

export interface AnalyticsDTO {
  totals: {
    conversations: number;
    open: number;
    snoozed: number;
    resolved: number;
    unassigned: number; // open + unassigned
    contacts: number;
    messages: number;
    publishedArticles: number;
  };
  resolutionRate: number; // 0..1 (resolved / total)
  avgMessagesPerConversation: number;
  byChannel: { channel: Channel; count: number }[];
  byStatus: { status: ConversationStatus; count: number }[];
  conversationsPerDay: { date: string; count: number }[]; // last 14 days, YYYY-MM-DD
  agentWorkload: { name: string; count: number }[]; // conversations assigned per agent
}
