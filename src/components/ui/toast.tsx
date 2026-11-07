"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import { HaloToast } from "./halo-toast";
import { Toaster } from "./sonner";
import {
  NOTIFICATION_LIMIT,
  appendNotification,
  loadNotifications,
  saveNotifications,
  type NotificationEntry,
  type NotificationTone,
} from "@/lib/notification-history";
import { currentTheme, type Theme } from "@/lib/theme";

type ToastFunction = (message: string, tone?: NotificationTone) => void;

interface NotificationHistory {
  entries: NotificationEntry[];
  clear: () => void;
}

const ToastContext = createContext<ToastFunction | null>(null);
const HistoryContext = createContext<NotificationHistory | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  // The ref is the source of truth so a toast pushed before the stored history loads is not lost.
  const history = useRef<NotificationEntry[]>([]);
  const loaded = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (loaded.current) return;
    loaded.current = true;
    history.current = [...history.current, ...loadNotifications()].slice(0, NOTIFICATION_LIMIT);
    setEntries(history.current);
  }, []);

  useEffect(() => {
    const syncTheme = () => setTheme(currentTheme());
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  const push = useCallback(
    (message: string, tone: NotificationTone = "success") => {
      ensureLoaded();
      history.current = appendNotification(history.current, { id: crypto.randomUUID(), message, tone, at: Date.now() });
      saveNotifications(history.current);
      setEntries(history.current);
      sonnerToast.custom((id) => <HaloToast toastId={id} message={message} tone={tone} />, {
        duration: tone === "error" ? 8000 : 4000,
      });
    },
    [ensureLoaded],
  );

  const clear = useCallback(() => {
    ensureLoaded();
    history.current = [];
    saveNotifications(history.current);
    setEntries(history.current);
  }, [ensureLoaded]);

  const historyValue = useMemo(() => ({ entries, clear }), [entries, clear]);

  return (
    <ToastContext.Provider value={push}>
      <HistoryContext.Provider value={historyValue}>
        {children}
        <Toaster theme={theme} position="bottom-right" offset={96} visibleToasts={3} closeButton={false} />
      </HistoryContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

export function useNotificationHistory() {
  const context = useContext(HistoryContext);
  if (!context) throw new Error("useNotificationHistory must be used inside <ToastProvider>");
  return context;
}
