"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import { HaloToast } from "./halo-toast";
import { Toaster } from "./sonner";
import { currentTheme, type Theme } from "@/lib/theme";

type ToastTone = "success" | "error";
type ToastFunction = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<ToastFunction | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const syncTheme = () => setTheme(currentTheme());
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const push = useCallback((message: string, tone: ToastTone = "success") => {
    sonnerToast.custom((id) => <HaloToast toastId={id} message={message} tone={tone} />, {
      duration: tone === "error" ? 8000 : 4000,
    });
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <Toaster theme={theme} position="bottom-right" offset={96} visibleToasts={3} closeButton={false} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
