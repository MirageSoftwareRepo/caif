import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireSession } from "./_guards";

// Helper server-side, NO es una server fn: lo llaman otras server fns
// (record-access, admin-doctors) para avisarle a un usuario de un evento del
// módulo clínico. La tabla `notifications` existía en el schema sin usarse
// en ningún lado (Plan 10, §5) — esto la pone en marcha.
export async function createNotification(params: {
  userId: string;
  title: string;
  message: string;
  type?: string;
  appointmentId?: string;
  accessRequestId?: string;
}) {
  await db.insert(notifications).values({
    userId: params.userId,
    title: params.title,
    message: params.message,
    type: params.type ?? "info",
    appointmentId: params.appointmentId ?? null,
    accessRequestId: params.accessRequestId ?? null,
  });
}

export const listMyNotifications = createServerFn({ method: "POST" })
  .inputValidator(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    return db.query.notifications.findMany({
      where: eq(notifications.userId, session.user.id),
      orderBy: [desc(notifications.createdAt)],
      limit: data.limit,
    });
  });

export const getUnreadNotificationCount = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, session.user.id), eq(notifications.isRead, false)));
  return count;
});

export const markNotificationRead = createServerFn({ method: "POST" })
  .inputValidator(z.object({ notificationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(eq(notifications.id, data.notificationId), eq(notifications.userId, session.user.id)),
      );
    return { success: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, session.user.id), eq(notifications.isRead, false)));
  return { success: true };
});
