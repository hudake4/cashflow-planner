import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Components render outside a Next.js app router here. A test reads the stub through
// `useRouter()` from "next/navigation" (e.g. to check `replace` calls).
const navigation = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() },
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => navigation.router,
  usePathname: () => window.location.pathname,
}));
afterEach(() => {
  for (const fn of Object.values(navigation.router)) fn.mockClear();
});

// jsdom does not implement <dialog>.showModal()/close(); minimal polyfill.
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & Record<string, unknown>;
  if (typeof proto.showModal !== "function" || !("open" in proto)) {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    proto.show = proto.showModal;
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
  try {
    // Force the polyfill when jsdom's showModal throws "not implemented".
    document.createElement("dialog").showModal();
  } catch {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

afterEach(() => cleanup());
