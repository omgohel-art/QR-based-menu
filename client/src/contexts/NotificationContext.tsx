import { createContext, useContext, useReducer, useCallback, useRef, type ReactNode } from "react";

export interface Notification {
  id: string;
  type: "order" | "system";
  title: string;
  body: string;
  orderId?: number;
  tableLabel?: string;
  orderNumber?: number;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
}

type NotificationAction =
  | { type: "ADD"; notification: Notification }
  | { type: "MARK_READ"; id: string }
  | { type: "MARK_ALL_READ" }
  | { type: "REMOVE"; id: string }
  | { type: "CLEAR" };

function reducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case "ADD": {
      const exists = state.notifications.some((n) => n.id === action.notification.id);
      if (exists) return state;
      const notifications = [action.notification, ...state.notifications].slice(0, 100);
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    }
    case "MARK_READ": {
      const notifications = state.notifications.map((n) =>
        n.id === action.id ? { ...n, read: true } : n
      );
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    }
    case "MARK_ALL_READ": {
      const notifications = state.notifications.map((n) => ({ ...n, read: true }));
      return { notifications, unreadCount: 0 };
    }
    case "REMOVE": {
      const notifications = state.notifications.filter((n) => n.id !== action.id);
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    }
    case "CLEAR":
      return { notifications: [], unreadCount: 0 };
    default:
      return state;
  }
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read"> & { id?: string }) => string;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => "",
  markRead: () => {},
  markAllRead: () => {},
  removeNotification: () => {},
  clearNotifications: () => {},
});

const seenIdsRef = new Set<string>();

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { notifications: [], unreadCount: 0 });
  const counterRef = useRef(0);

  const addNotification = useCallback((n: Omit<Notification, "id" | "timestamp" | "read"> & { id?: string }) => {
    const id = n.id || `notif-${Date.now()}-${counterRef.current++}`;
    if (seenIdsRef.has(id)) return id;
    seenIdsRef.add(id);
    setTimeout(() => seenIdsRef.delete(id), 30_000);
    dispatch({
      type: "ADD",
      notification: { ...n, id, timestamp: Date.now(), read: false },
    });
    return id;
  }, []);

  const markRead = useCallback((id: string) => dispatch({ type: "MARK_READ", id }), []);
  const markAllRead = useCallback(() => dispatch({ type: "MARK_ALL_READ" }), []);
  const removeNotification = useCallback((id: string) => dispatch({ type: "REMOVE", id }), []);
  const clearNotifications = useCallback(() => dispatch({ type: "CLEAR" }), []);

  return (
    <NotificationContext.Provider
      value={{
        notifications: state.notifications,
        unreadCount: state.unreadCount,
        addNotification,
        markRead,
        markAllRead,
        removeNotification,
        clearNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
