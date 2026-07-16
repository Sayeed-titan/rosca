import "server-only";

export async function listNotifications(db, userId, { limit = 20 } = {}) {
  const rows = await db.notification.findMany({
    where: { userId, channel: "IN_APP" },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      readAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    isRead: Boolean(n.readAt),
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function countUnread(db, userId) {
  return db.notification.count({
    where: { userId, channel: "IN_APP", readAt: null },
  });
}

/**
 * Mark as read. Scoped by userId as well as id — without it, any notification id
 * would be markable by anyone who guessed it.
 */
export async function markRead(db, userId, notificationId) {
  await db.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

export async function markAllRead(db, userId) {
  const { count } = await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { count };
}
