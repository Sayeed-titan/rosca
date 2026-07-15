-- Multi-seat committees.
--
-- 1. `totalMembers` was a misleading name once a member can hold several seats:
--    a committee of 8 SEATS might be 5 people. RENAME rather than drop-and-add —
--    Prisma's auto-generated version would have destroyed the existing values.
ALTER TABLE "Committee" RENAME COLUMN "totalMembers" TO "totalSeats";

-- 2. Allow one member to hold multiple seats in the same committee.
--    Taking two or three shares is normal in a real ROSCA: the member pays the
--    contribution once per seat, and is eligible to receive the pot once per seat.
--
--    Safe to drop: every money and draw record keys off committeeMemberId (the
--    SEAT), never memberId. UNIQUE(winnerCommitteeMemberId) on Draw therefore still
--    guarantees each seat wins exactly once — which is the rule that actually matters.
DROP INDEX IF EXISTS "CommitteeMember_committeeId_memberId_key";

-- 3. Keep it indexed (non-unique) — "how many seats does this member hold here?"
--    is now a real question that shouldn't need a scan.
CREATE INDEX IF NOT EXISTS "CommitteeMember_committeeId_memberId_idx"
  ON "CommitteeMember"("committeeId", "memberId");
