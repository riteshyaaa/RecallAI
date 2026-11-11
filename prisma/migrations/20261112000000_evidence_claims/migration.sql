CREATE TABLE "EvidenceSource" (
    "id" TEXT NOT NULL,
    "searchExecutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "publishedDate" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceClaim" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceClaimSource" (
    "claimId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    CONSTRAINT "EvidenceClaimSource_pkey" PRIMARY KEY ("claimId", "sourceId")
);

CREATE UNIQUE INDEX "EvidenceSource_searchExecutionId_url_key" ON "EvidenceSource"("searchExecutionId", "url");
CREATE INDEX "EvidenceSource_url_retrievedAt_idx" ON "EvidenceSource"("url", "retrievedAt");
CREATE INDEX "EvidenceClaim_messageId_createdAt_idx" ON "EvidenceClaim"("messageId", "createdAt");
CREATE INDEX "EvidenceClaimSource_sourceId_idx" ON "EvidenceClaimSource"("sourceId");

ALTER TABLE "EvidenceSource" ADD CONSTRAINT "EvidenceSource_searchExecutionId_fkey" FOREIGN KEY ("searchExecutionId") REFERENCES "SearchExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceClaim" ADD CONSTRAINT "EvidenceClaim_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceClaimSource" ADD CONSTRAINT "EvidenceClaimSource_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "EvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceClaimSource" ADD CONSTRAINT "EvidenceClaimSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EvidenceSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
