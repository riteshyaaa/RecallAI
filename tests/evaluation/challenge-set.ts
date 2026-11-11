export type EvaluationMessage = {
  id: string;
  sessionId: string;
  conversationId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
};

export type MemoryEvaluationCase = {
  name: string;
  prompt: string;
  now: string;
  timeZone: string;
  activeConversationId: string;
  messages: EvaluationMessage[];
  expectedMessageIds: string[];
  excludedMessageIds: string[];
  expectedUtcRange?: { start: string; end: string };
};

const sessionId = "challenge-evaluation-session";
export const evaluationSessionId = sessionId;

export const memoryEvaluationCases: MemoryEvaluationCase[] = [
  {
    name: "returns no invented history when the requested day has no messages",
    prompt: "What did I ask yesterday?",
    now: "2026-11-11T08:00:00.000Z",
    timeZone: "Asia/Kolkata",
    activeConversationId: "today-chat",
    messages: [
      {
        id: "older-unrelated-question",
        sessionId,
        conversationId: "old-chat",
        role: "USER",
        content: "How does Postgres replication work?",
        createdAt: "2026-11-08T08:00:00.000Z",
      },
    ],
    expectedMessageIds: [],
    excludedMessageIds: ["older-unrelated-question"],
  },
  {
    name: "resolves a follow-up about the shortlisted CRM tools",
    prompt: "Have any of them changed pricing or shipped something big since?",
    now: "2026-11-11T08:00:00.000Z",
    timeZone: "Asia/Kolkata",
    activeConversationId: "current-chat",
    messages: [
      {
        id: "crm-shortlist",
        sessionId,
        conversationId: "crm-research",
        role: "USER",
        content:
          "On Monday we shortlisted five CRM tools for a 20-person sales team: HubSpot, Pipedrive, Salesforce, Zoho CRM, and Freshsales.",
        createdAt: "2026-11-09T14:00:00.000Z",
      },
      {
        id: "crm-shortlist-answer",
        sessionId,
        conversationId: "crm-research",
        role: "ASSISTANT",
        content:
          "The five shortlisted CRMs were HubSpot, Pipedrive, Salesforce, Zoho CRM, and Freshsales.",
        createdAt: "2026-11-09T14:01:00.000Z",
      },
      {
        id: "unrelated-budget-chat",
        sessionId,
        conversationId: "budget-chat",
        role: "USER",
        content: "Help me compare two household budgeting apps.",
        createdAt: "2026-11-10T09:00:00.000Z",
      },
    ],
    expectedMessageIds: ["crm-shortlist"],
    excludedMessageIds: [],
  },
  {
    name: "resolves the second shortlisted company before a fresh pricing search",
    prompt:
      "Find current pricing for the second one we shortlisted and any recent plan changes.",
    now: "2026-11-11T08:00:00.000Z",
    timeZone: "Asia/Kolkata",
    activeConversationId: "new-search-chat",
    messages: [
      {
        id: "ordered-company-shortlist",
        sessionId,
        conversationId: "old-vendor-chat",
        role: "USER",
        content:
          "We shortlisted Acme CRM, Pipedrive, and Northstar Sales in that order for our team.",
        createdAt: "2026-11-04T11:00:00.000Z",
      },
      {
        id: "ordered-company-answer",
        sessionId,
        conversationId: "old-vendor-chat",
        role: "ASSISTANT",
        content: "Pipedrive was the second option on the shortlist.",
        createdAt: "2026-11-04T11:02:00.000Z",
      },
    ],
    expectedMessageIds: ["ordered-company-shortlist", "ordered-company-answer"],
    excludedMessageIds: [],
  },
  {
    name: "recalls the exact November 3 question in the user's India timezone",
    prompt:
      "What did I ask you on 3 November? Is your answer still correct today?",
    now: "2026-11-11T08:00:00.000Z",
    timeZone: "Asia/Kolkata",
    activeConversationId: "today-chat",
    expectedUtcRange: {
      start: "2026-11-02T18:30:00.000Z",
      end: "2026-11-03T18:30:00.000Z",
    },
    messages: [
      {
        id: "nov3-question",
        sessionId,
        conversationId: "november-research",
        role: "USER",
        content: "Which managed Postgres hosts offer a free tier?",
        createdAt: "2026-11-02T18:30:00.000Z",
      },
      {
        id: "nov3-answer",
        sessionId,
        conversationId: "november-research",
        role: "ASSISTANT",
        content: "I compared the free tiers from Neon and Supabase.",
        createdAt: "2026-11-03T12:00:00.000Z",
      },
      {
        id: "nov4-decoy",
        sessionId,
        conversationId: "november-research",
        role: "USER",
        content: "What changed in managed Postgres pricing on November 4?",
        createdAt: "2026-11-03T18:30:00.000Z",
      },
    ],
    expectedMessageIds: ["nov3-question", "nov3-answer"],
    excludedMessageIds: ["nov4-decoy"],
  },
  {
    name: "retrieves last Tuesday's Postgres hosting discussion without Monday's decoy",
    prompt:
      "Last Tuesday I asked about Postgres hosting. Has any pricing changed since then?",
    now: "2026-11-11T08:00:00.000Z",
    timeZone: "Asia/Kolkata",
    activeConversationId: "new-postgres-followup",
    expectedUtcRange: {
      start: "2026-11-09T18:30:00.000Z",
      end: "2026-11-10T18:30:00.000Z",
    },
    messages: [
      {
        id: "postgres-tuesday-question",
        sessionId,
        conversationId: "postgres-chat",
        role: "USER",
        content: "Which Postgres hosting service is best for a small app?",
        createdAt: "2026-11-10T06:00:00.000Z",
      },
      {
        id: "postgres-tuesday-answer",
        sessionId,
        conversationId: "postgres-chat",
        role: "ASSISTANT",
        content: "We compared Neon, Supabase, and Render pricing.",
        createdAt: "2026-11-10T06:03:00.000Z",
      },
      {
        id: "postgres-monday-decoy",
        sessionId,
        conversationId: "postgres-chat",
        role: "USER",
        content: "How do I tune Postgres indexes?",
        createdAt: "2026-11-09T17:00:00.000Z",
      },
    ],
    expectedMessageIds: [
      "postgres-tuesday-question",
      "postgres-tuesday-answer",
    ],
    excludedMessageIds: ["postgres-monday-decoy"],
  },
  {
    name: "uses Los Angeles local midnight rather than the UTC date for yesterday",
    prompt: "What did I ask yesterday?",
    now: "2026-11-04T01:00:00.000Z",
    timeZone: "America/Los_Angeles",
    activeConversationId: "today-chat",
    expectedUtcRange: {
      start: "2026-11-02T08:00:00.000Z",
      end: "2026-11-03T08:00:00.000Z",
    },
    messages: [
      {
        id: "la-yesterday-start",
        sessionId,
        conversationId: "la-chat",
        role: "USER",
        content: "Compare the cost of a commuter rail pass.",
        createdAt: "2026-11-02T08:00:00.000Z",
      },
      {
        id: "la-yesterday-end",
        sessionId,
        conversationId: "la-chat",
        role: "USER",
        content: "Find the weather forecast for today.",
        createdAt: "2026-11-03T08:00:00.000Z",
      },
    ],
    expectedMessageIds: ["la-yesterday-start"],
    excludedMessageIds: ["la-yesterday-end"],
  },
  {
    name: "retrieves the correct named date in Los Angeles time",
    prompt: "What did I ask on November 3, 2026?",
    now: "2026-11-11T08:00:00.000Z",
    timeZone: "America/Los_Angeles",
    activeConversationId: "current-chat",
    expectedUtcRange: {
      start: "2026-11-03T08:00:00.000Z",
      end: "2026-11-04T08:00:00.000Z",
    },
    messages: [
      {
        id: "la-nov3-question",
        sessionId,
        conversationId: "la-november-chat",
        role: "USER",
        content: "When does daylight saving time end?",
        createdAt: "2026-11-03T08:00:00.000Z",
      },
      {
        id: "la-nov4-decoy",
        sessionId,
        conversationId: "la-november-chat",
        role: "USER",
        content: "What events are scheduled for tomorrow?",
        createdAt: "2026-11-04T08:00:00.000Z",
      },
    ],
    expectedMessageIds: ["la-nov3-question"],
    excludedMessageIds: ["la-nov4-decoy"],
  },
  {
    name: "handles yesterday across Denver's 23-hour daylight-saving day",
    prompt: "What did I ask yesterday?",
    now: "2025-03-10T12:00:00.000Z",
    timeZone: "America/Denver",
    activeConversationId: "current-chat",
    expectedUtcRange: {
      start: "2025-03-09T07:00:00.000Z",
      end: "2025-03-10T06:00:00.000Z",
    },
    messages: [
      {
        id: "denver-yesterday-start",
        sessionId,
        conversationId: "denver-chat",
        role: "USER",
        content: "Explain how daylight saving time affects a local date.",
        createdAt: "2025-03-09T07:00:00.000Z",
      },
      {
        id: "denver-yesterday-end",
        sessionId,
        conversationId: "denver-chat",
        role: "USER",
        content: "What is the date today?",
        createdAt: "2025-03-10T06:00:00.000Z",
      },
    ],
    expectedMessageIds: ["denver-yesterday-start"],
    excludedMessageIds: ["denver-yesterday-end"],
  },
];
