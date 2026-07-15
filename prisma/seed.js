/**
 * Demo seed.
 *
 * Run with: npm run db:seed
 *
 * Imports use relative paths and an explicit .ts extension because this runs under
 * plain Node (which strips types natively on 22.18+) rather than through Next's
 * bundler, so the "@/..." alias is not available here.
 *
 * Seeds an organization, one user per role, eight ROSCA members and one active
 * committee. Deliberately seeds NO payments and NO draws — those get created
 * through the real service layer so their invariants are exercised rather than
 * bypassed by direct inserts.
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { hashPassword } from "../src/core/auth/password.js";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

// Seed over the direct/session connection, not the transaction pooler.
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

/** Demo password for every seeded account. Local demo data only. */
const DEMO_PASSWORD = "Password123!";

const MEMBERS = [
  { fullName: "Rahima Akter",       phone: "+8801711000001", occupation: "Tailor",           nationalId: "1990111000001" },
  { fullName: "Kamal Hossain",      phone: "+8801711000002", occupation: "Grocer",           nationalId: "1988111000002" },
  { fullName: "Nusrat Jahan",       phone: "+8801711000003", occupation: "Teacher",          nationalId: "1992111000003" },
  { fullName: "Abdul Karim",        phone: "+8801711000004", occupation: "Rickshaw owner",   nationalId: "1985111000004" },
  { fullName: "Shirin Sultana",     phone: "+8801711000005", occupation: "Beautician",       nationalId: "1994111000005" },
  { fullName: "Mizanur Rahman",     phone: "+8801711000006", occupation: "Electrician",      nationalId: "1987111000006" },
  { fullName: "Fatema Begum",       phone: "+8801711000007", occupation: "Homemaker",        nationalId: "1991111000007" },
  { fullName: "Jashim Uddin",       phone: "+8801711000008", occupation: "Van driver",       nationalId: "1983111000008" },
];

async function main() {
  console.log("Seeding CircleFund demo data...");

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // --- Organization -------------------------------------------------------
  const org = await prisma.organization.upsert({
    where: { slug: "dhaka-savings-circle" },
    update: {},
    create: {
      name: "Dhaka Savings Circle",
      slug: "dhaka-savings-circle",
      currency: "BDT",
      timezone: "Asia/Dhaka",
    },
  });
  console.log(`  organization: ${org.name}`);

  // --- Users, one per role ------------------------------------------------
  const people = [
    { email: "super@circlefund.dev",   name: "Platform Admin", isSuperAdmin: true,  role: null },
    { email: "owner@circlefund.dev",   name: "Ayesha Rahman",  isSuperAdmin: false, role: "ORG_OWNER" },
    { email: "manager@circlefund.dev", name: "Tanvir Ahmed",   isSuperAdmin: false, role: "MANAGER" },
    { email: "member@circlefund.dev",  name: "Rahima Akter",   isSuperAdmin: false, role: "MEMBER" },
  ];

  const users = {};
  for (const p of people) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: { passwordHash, isSuperAdmin: p.isSuperAdmin },
      create: {
        email: p.email,
        name: p.name,
        passwordHash,
        isSuperAdmin: p.isSuperAdmin,
        emailVerified: new Date(),
      },
    });
    users[p.email] = user;

    if (p.role) {
      await prisma.membership.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
        update: { role: p.role },
        create: { organizationId: org.id, userId: user.id, role: p.role },
      });
    }
    console.log(`  user: ${p.email.padEnd(26)} ${p.role ?? "SUPER_ADMIN"}`);
  }

  // --- Members ------------------------------------------------------------
  const members = [];
  for (const m of MEMBERS) {
    const member = await prisma.member.upsert({
      where: {
        organizationId_nationalId: { organizationId: org.id, nationalId: m.nationalId },
      },
      update: {},
      create: {
        organizationId: org.id,
        fullName: m.fullName,
        phone: m.phone,
        nationalId: m.nationalId,
        occupation: m.occupation,
        email: `${m.fullName.split(" ")[0].toLowerCase()}@example.com`,
        address: "Mirpur, Dhaka",
        status: "ACTIVE",
        // Link the demo member login to their participant record.
        userId: m.fullName === "Rahima Akter" ? users["member@circlefund.dev"].id : null,
      },
    });
    members.push(member);
  }
  console.log(`  members: ${members.length}`);

  // --- Committee ----------------------------------------------------------
  // BDT 5,000/month x 8 members => a BDT 40,000 pot each cycle.
  // 500000 == 5,000.00 BDT expressed in paisa. Money is never a float.
  const existing = await prisma.committee.findFirst({
    where: { organizationId: org.id, name: "Mirpur Monthly Committee" },
  });

  const committee =
    existing ??
    (await prisma.committee.create({
      data: {
        organizationId: org.id,
        name: "Mirpur Monthly Committee",
        description: "Eight neighbours, BDT 5,000 each month, one payout per month.",
        contributionMinor: 500000n,
        currency: "BDT",
        currencyExponent: 2,
        totalMembers: MEMBERS.length,
        startDate: new Date("2026-01-05"),
        drawFrequency: "MONTHLY",
        drawDay: 5,
        gracePeriodDays: 3,
        lateFeeType: "PERCENT",
        lateFeePercentBps: 250, // 2.50%
        status: "ACTIVE",
      },
    }));
  console.log(`  committee: ${committee.name}`);

  // --- Seats --------------------------------------------------------------
  for (const [i, member] of members.entries()) {
    await prisma.committeeMember.upsert({
      where: {
        committeeId_memberId: { committeeId: committee.id, memberId: member.id },
      },
      update: {},
      create: {
        organizationId: org.id,
        committeeId: committee.id,
        memberId: member.id,
        position: i + 1,
        status: "ACTIVE",
      },
    });
  }
  console.log(`  seats: ${members.length}`);

  // --- Settings -----------------------------------------------------------
  const settings = [
    { key: "draw.algorithm", value: { name: "commit-reveal-hmac", version: 1 } },
    { key: "draw.requireFullCollection", value: { enabled: true } },
    { key: "locale", value: { language: "en", currency: "BDT" } },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId: org.id, key: s.key } },
      update: { value: s.value },
      create: { organizationId: org.id, key: s.key, value: s.value },
    });
  }

  console.log("\nDone. Sign in with any of:");
  for (const p of people) console.log(`  ${p.email.padEnd(26)} / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
