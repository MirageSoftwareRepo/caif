import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useTabVisible } from "@/lib/useTabVisible";
import {
  listMyNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api/notifications.functions";

const POLL_MS = 60_000;

function fmtRelative(d: string | Date | null) {
  if (!d) return "";
  const diffMs = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(d).toLocaleDateString("es-AR");
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const tabVisible = useTabVisible();

  const { data: unreadCount } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => getUnreadNotificationCount(),
    refetchInterval: tabVisible ? POLL_MS : false,
  });

  const { data: notifications, refetch } = useQuery({
    queryKey: ["notifications-list"],
    queryFn: () => listMyNotifications({ data: { limit: 10 } }),
    refetchInterval: tabVisible ? POLL_MS : false,
  });

  const handleOpen = (open: boolean) => {
    if (open) void refetch();
  };

  const handleMarkRead = async (id: string) => {
    await markNotificationRead({ data: { notificationId: id } });
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
  };

  return (
    <Popover onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative min-h-[44px] min-w-[44px] p-0"
          aria-label="Notificaciones"
        >
          <Bell className="h-4 w-4" />
          {!!unreadCount && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notificaciones</span>
          {!!unreadCount && (
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs" onClick={() => void handleMarkAllRead()}>
              Marcar todas como leídas
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Sin notificaciones.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.isRead && void handleMarkRead(n.id)}
                className={`block w-full border-b border-border px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted/50 ${
                  n.isRead ? "" : "bg-primary/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{n.title}</span>
                  {!n.isRead && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                </div>
                <p className="text-xs text-muted-foreground">{n.message}</p>
                <span className="text-[10px] text-muted-foreground">{fmtRelative(n.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
