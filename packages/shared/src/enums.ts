export const Role = { ADMIN: "ADMIN", AGENT: "AGENT" } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const MembershipStatus = { INVITED: "INVITED", ACTIVE: "ACTIVE" } as const;
export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const Channel = { CHAT: "CHAT", EMAIL: "EMAIL" } as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

export const ConversationStatus = {
  OPEN: "OPEN",
  SNOOZED: "SNOOZED",
  RESOLVED: "RESOLVED",
} as const;
export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const SenderType = { CONTACT: "CONTACT", AGENT: "AGENT", SYSTEM: "SYSTEM" } as const;
export type SenderType = (typeof SenderType)[keyof typeof SenderType];

export const ArticleStatus = { DRAFT: "DRAFT", PUBLISHED: "PUBLISHED" } as const;
export type ArticleStatus = (typeof ArticleStatus)[keyof typeof ArticleStatus];

export const DomainStatus = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  SSL_PROVISIONING: "SSL_PROVISIONING",
  ACTIVE: "ACTIVE",
  FAILED: "FAILED",
} as const;
export type DomainStatus = (typeof DomainStatus)[keyof typeof DomainStatus];

export const SummaryStatus = { FRESH: "FRESH", STALE: "STALE", FAILED: "FAILED" } as const;
export type SummaryStatus = (typeof SummaryStatus)[keyof typeof SummaryStatus];
