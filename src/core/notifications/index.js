import "server-only";

/**
 * Notification delivery.
 *
 * A channel interface with pluggable adapters, so adding SMS or WhatsApp later
 * is one new adapter file rather than a change to every caller.
 *
 * WHAT IS AND ISN'T HERE, honestly:
 *
 *  - IN_APP works. It writes a Notification row that the bell reads.
 *  - EMAIL / SMS / WHATSAPP / PUSH are registered but log-only. They record the
 *    notification with status PENDING and print what they *would* send.
 *
 * That last part is deliberate. Real delivery needs Twilio/SES/Meta credentials
 * and a paid account to test against. Writing an untested Twilio client that
 * looks finished would be worse than an honest stub: it would fail silently in
 * production, on exactly the "your payment is late" messages people rely on.
 * The Notification row is still written either way, so nothing is lost when a
 * real adapter is dropped in.
 */

/**
 * @typedef {object} NotificationChannel
 * @property {string} name
 * @property {(payload: object) => Promise<{sent: boolean, error?: string}>} send
 */

/** Writes the row and nothing else — the bell polls for these. */
const inAppChannel = {
  name: "IN_APP",
  async send() {
    // The row IS the delivery for in-app.
    return { sent: true };
  },
};

/**
 * Placeholder for the channels that need third-party credentials.
 * Logs rather than pretending — see the note above.
 */
function loggingChannel(name) {
  return {
    name,
    async send(payload) {
      console.info(
        `[notifications:${name}] would send to ${payload.to ?? "unknown"}: ${payload.title}`
      );
      return {
        sent: false,
        error: `${name} delivery is not configured — no provider credentials.`,
      };
    },
  };
}

const CHANNELS = {
  IN_APP: inAppChannel,
  EMAIL: loggingChannel("EMAIL"),
  SMS: loggingChannel("SMS"),
  WHATSAPP: loggingChannel("WHATSAPP"),
  PUSH: loggingChannel("PUSH"),
};

export function getChannel(name) {
  return CHANNELS[name] ?? CHANNELS.IN_APP;
}

/**
 * Record and deliver a notification.
 *
 * Pass a transaction client to tie the notification to the mutation that caused
 * it (e.g. a payment reminder created alongside the payment record). Delivery
 * failure never rolls back the row — a missed SMS shouldn't undo a payment.
 *
 * @param {object} client       Prisma client or transaction
 * @param {object} notification
 * @param {string} notification.channel   IN_APP | EMAIL | SMS | WHATSAPP | PUSH
 * @param {string} notification.type      PAYMENT_DUE | PAYMENT_LATE | WINNER_ANNOUNCED | COMMITTEE_COMPLETED | GENERIC
 * @param {string} notification.title
 * @param {string} notification.body
 * @param {string} [notification.userId]
 * @param {string} [notification.memberId]
 * @param {object} [notification.payload]
 */
export async function notify(client, notification) {
  const channel = getChannel(notification.channel);

  const row = await client.notification.create({
    data: {
      channel: notification.channel,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: notification.payload ?? null,
      userId: notification.userId ?? null,
      memberId: notification.memberId ?? null,
      status: "PENDING",
    },
    select: { id: true },
  });

  const result = await channel.send(notification);

  await client.notification.update({
    where: { id: row.id },
    data: {
      status: result.sent ? "SENT" : "FAILED",
      sentAt: result.sent ? new Date() : null,
      error: result.error ?? null,
    },
  });

  return { id: row.id, ...result };
}

/** Fan out to everyone with a login in the org. */
export async function notifyOrganization(client, notification) {
  const memberships = await client.membership.findMany({
    where: { deletedAt: null },
    select: { userId: true },
  });

  return Promise.all(
    memberships.map((m) =>
      notify(client, { ...notification, channel: "IN_APP", userId: m.userId })
    )
  );
}
