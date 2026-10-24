import {
  ArrowLeftRight,
  Car,
  Clapperboard,
  Ellipsis,
  Fuel,
  HeartPulse,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { SpendingCategory } from "@/contracts/api";

/** Typed as Records so adding a category to SPENDING_CATEGORIES is a compile error until it is labelled here. */
export const CATEGORY_LABELS: Record<SpendingCategory, string> = {
  GROCERIES: "Groceries",
  DINING: "Dining",
  GAS: "Gas",
  UTILITIES: "Utilities",
  BILLS: "Bills",
  SHOPPING: "Shopping",
  TRANSPORT: "Transport",
  ENTERTAINMENT: "Entertainment",
  HEALTH: "Health",
  TRANSFERS: "Transfers",
  OTHER: "Other",
};

export const CATEGORY_ICONS: Record<SpendingCategory, LucideIcon> = {
  GROCERIES: ShoppingCart,
  DINING: Utensils,
  GAS: Fuel,
  UTILITIES: Zap,
  BILLS: Receipt,
  SHOPPING: ShoppingBag,
  TRANSPORT: Car,
  ENTERTAINMENT: Clapperboard,
  HEALTH: HeartPulse,
  TRANSFERS: ArrowLeftRight,
  OTHER: Ellipsis,
};
