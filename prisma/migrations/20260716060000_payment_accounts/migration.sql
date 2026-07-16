-- Saved payment accounts (MFS/bank numbers) per member.
--
-- Reuses the existing PaymentMethod enum so a saved account's `method` lines up
-- exactly with what a Payment can record it as.
CREATE TABLE "MemberPaymentAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPaymentAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberPaymentAccount_organizationId_idx" ON "MemberPaymentAccount"("organizationId");
CREATE INDEX "MemberPaymentAccount_memberId_method_idx" ON "MemberPaymentAccount"("memberId", "method");

ALTER TABLE "MemberPaymentAccount" ADD CONSTRAINT "MemberPaymentAccount_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberPaymentAccount" ADD CONSTRAINT "MemberPaymentAccount_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
