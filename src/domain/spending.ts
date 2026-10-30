/**
 * Spend analyzer (CONVENTIONS section 13). Pure: no Prisma, no clock (today is passed in), no I/O.
 *
 * Money out of the stored bank history is grouped by category for this calendar month (1st through
 * today) and last month. A category is the user's choice for that transaction, else what the user
 * taught the analyzer about its merchant, else the keyword rules below. Only those two kinds of
 * choice are stored, so improving the lists below re-categorizes everything the user hasn't decided.
 */
import { SPENDING_CATEGORIES } from "../contracts/api";
import type {
  AccountKind,
  SpendingAnalysisDTO,
  SpendingCategory,
  SpendingCategorySource,
  SpendingCategoryTotalDTO,
  SpendingMerchantDTO,
  SpendingPeriodDTO,
  SpendingTransactionDTO,
} from "../contracts/api";
import { matchCardPayments } from "./card-payments";
import { daysInMonth, formatIsoDate, parseIsoDate } from "./dates";
import { displayName, nameTokens } from "./recurring";

export interface SpendingTransaction {
  id: string;
  date: string;
  description: string;
  /** Signed like the bank: money in positive, money out negative. */
  amountCents: number;
  /** The user's label of the account it belongs to. Without it a transaction is never matched to a card payment. */
  accountKind?: AccountKind;
}

export interface SpendingInput {
  transactions: SpendingTransaction[];
  /** Server-local calendar date. */
  today: string;
  /** The user's category for one transaction, by transaction id. */
  overrides?: ReadonlyMap<string, SpendingCategory>;
  /** What the user taught the analyzer, by `merchantKey`. */
  merchantRules?: ReadonlyMap<string, SpendingCategory>;
}

const TOP_MERCHANTS = 5;
const KEY_TOKENS = 3;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * Keywords are matched against the description's words (lower-cased, `'` and `&` dropped, split on
 * anything that isn't a letter or digit). "two words" must be consecutive words. A keyword matches a
 * whole word only; a trailing `*` also matches a word that merely starts with it ("fuel*" matches
 * "fuels" and "fuel12345"). Never an arbitrary substring, so "bar" does not match "barnes".
 */
interface Rule {
  category: SpendingCategory;
  keywords: string[];
  /** If any of these match the rule is skipped, so a more specific category further down can win. */
  unless?: string[];
}

// First match wins, so the order is the priority. Precision matters more than recall: unknown means OTHER.
const RULES: Rule[] = [
  {
    category: "TRANSFERS",
    keywords: [
      "transfer*", "xfer*", "zelle", "venmo", "cash app", "cashapp", "apple cash", "paypal transfer", "atm",
      "payment thank you", "credit card payment", "card payment", "credit crd", "autopay to card",
      "epayment", "e payment", "credit card bill payment", "card bill payment", "citi autopay",
    ],
  },
  {
    category: "GAS",
    keywords: [
      "gas", "gasoline", "fuel*", "gas station", "shell", "chevron", "exxon*", "mobil", "bp", "sunoco", "marathon petro*",
      "speedway", "wawa fuel", "citgo", "valero", "texaco", "arco", "conoco", "phillips 66",
    ],
    unless: ["natural gas", "gas light", "gas electric", "gas and electric", "gas company", "gas service", "gas utility"],
  },
  {
    category: "GROCERIES",
    keywords: [
      "grocery", "groceries", "grocer*", "supermarket", "kroger*", "walmart grocery", "amazon fresh", "safeway", "publix",
      "aldi", "trader joe*", "whole foods", "costco", "heb", "wegmans", "food lion", "giant eagle", "stop shop", "meijer",
      "sprouts", "winco", "albertsons", "harris teeter", "piggly wiggly", "save a lot", "instacart", "sams club", "lidl",
      "ralphs", "vons", "fred meyer", "market basket",
    ],
  },
  {
    category: "DINING",
    keywords: [
      "restaurant*", "cafe*", "coffee", "starbucks", "mcdonald*", "chipotle", "doordash", "uber eats", "ubereats", "grubhub",
      "pizza*", "pizzeria", "bar", "grill*", "diner", "dunkin*", "burger*", "taco*", "wendys", "chick fil", "bakery", "pub",
      "tavern", "brewery", "bistro", "eatery", "steakhouse", "deli", "bagel*", "donut*", "sushi", "panera", "kfc", "popeyes",
      "domino*", "papa john*", "wingstop", "tst",
    ],
  },
  {
    category: "UTILITIES",
    keywords: [
      "electric*", "power", "water", "wastewater", "sewer", "energy", "duke energy", "pge", "con edison", "coned", "national grid",
      "natural gas", "gas light", "gas electric", "gas and electric", "gas company", "gas service", "gas utility",
      "internet", "broadband", "cable", "comcast", "xfinity", "spectrum", "verizon", "att", "t mobile", "tmobile", "mint mobile",
      "cricket wireless", "wireless", "phone", "fios", "centurylink", "optimum", "cox", "waste management", "trash", "utility",
      "utilities",
    ],
  },
  {
    category: "BILLS",
    keywords: [
      "rent", "mortgage*", "insurance", "loan*", "hoa", "tuition", "subscription", "geico", "state farm", "progressive",
      "allstate", "liberty mutual", "usaa", "student loan", "sallie mae", "navient", "nelnet", "lease", "apartment*",
      "property management", "landlord", "pennymac", "rocket mortgage", "mr cooper", "loandepot",
    ],
    unless: ["rent a car", "rent car"],
  },
  {
    category: "TRANSPORT",
    keywords: [
      "uber", "lyft", "parking", "toll*", "transit", "metro", "airlines", "airways", "airport", "delta air*", "jetblue", "amtrak",
      "greyhound", "taxi", "ezpass", "sunpass", "fastrak", "ipass", "mta", "bart", "septa", "wmata", "zipcar", "turo", "hertz", "avis",
      "enterprise rent*", "rent a car",
    ],
  },
  {
    category: "ENTERTAINMENT",
    keywords: [
      "netflix", "hulu", "spotify", "disney*", "cinema*", "theater*", "theatre*", "steam", "steampowered", "steamgames", "playstation",
      "xbox", "nintendo", "movie*", "amc", "regal", "hbo", "youtube", "peacock", "paramount", "crunchyroll", "ticketmaster",
      "stubhub", "concert*", "bowling", "arcade", "museum", "apple music", "siriusxm",
    ],
  },
  {
    category: "HEALTH",
    keywords: [
      "pharmacy", "cvs", "walgreen*", "rite aid", "clinic*", "dental*", "dentist*", "medical", "hospital*", "doctor", "physician*",
      "urgent care", "optical", "optometr*", "labcorp", "quest diagnostics", "therapy", "pediatric*", "health", "healthcare",
      "gym", "fitness", "planet fitness", "orangetheory", "ymca",
    ],
  },
  {
    category: "SHOPPING",
    keywords: [
      "amazon*", "amzn*", "target", "walmart", "wal mart", "best buy", "store", "stores", "shop", "shops", "shopping", "mall",
      "outlet*", "boutique", "nike", "old navy", "gap", "zara", "tj maxx", "tjmaxx", "marshalls", "nordstrom", "macys", "kohls",
      "home depot", "lowes", "ikea", "bed bath", "etsy", "ebay", "dollar tree", "dollar general", "big lots", "burlington",
      "michaels", "hobby lobby", "petco", "petsmart",
    ],
  },
];

interface Matcher {
  words: string[];
  /** The last word may be a prefix of a description word. */
  prefix: boolean;
}

function compile(keyword: string): Matcher {
  const prefix = keyword.endsWith("*");
  return { words: keyword.replace(/\*$/, "").split(" "), prefix };
}

const COMPILED = RULES.map((rule) => ({
  category: rule.category,
  keywords: rule.keywords.map(compile),
  unless: (rule.unless ?? []).map(compile),
}));

function words(description: string): string[] {
  return description
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’&]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function matches(tokens: string[], { words: keyword, prefix }: Matcher): boolean {
  const last = keyword.length - 1;
  for (let start = 0; start + last < tokens.length; start++) {
    const fits = keyword.every((w, i) => {
      const token = tokens[start + i];
      return i === last && prefix ? token.startsWith(w) : token === w;
    });
    if (fits) return true;
  }
  return false;
}

/** The spending category of a bank description: the first rule (in priority order) that matches, else OTHER. */
export function categorize(description: string): SpendingCategory {
  const tokens = words(description);
  const rule = COMPILED.find(
    (r) => r.keywords.some((k) => matches(tokens, k)) && !r.unless.some((k) => matches(tokens, k)),
  );
  return rule?.category ?? "OTHER";
}

/**
 * Identifies a merchant: the first three words of its cleaned-up name, so "KROGER #1234" and
 * "Kroger 5678" are one merchant. Empty when the description has no usable name.
 */
export function merchantKey(description: string): string {
  return nameTokens(description).slice(0, KEY_TOKENS).join(" ");
}

/**
 * The category and where it came from: the user's pick for this transaction, then the learned merchant
 * rule, then a bank debit that a credit account received (a card payment), then keywords.
 */
function resolveCategory(
  t: SpendingTransaction,
  key: string,
  overrides: ReadonlyMap<string, SpendingCategory> | undefined,
  merchantRules: ReadonlyMap<string, SpendingCategory> | undefined,
  cardPayments: ReadonlySet<string>,
): { category: SpendingCategory; source: SpendingCategorySource } {
  const manual = overrides?.get(t.id);
  if (manual) return { category: manual, source: "MANUAL" };
  const learned = key ? merchantRules?.get(key) : undefined;
  if (learned) return { category: learned, source: "MERCHANT" };
  if (cardPayments.has(t.id)) return { category: "TRANSFERS", source: "AUTO" };
  return { category: categorize(t.description), source: "AUTO" };
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

interface Spend {
  id: string;
  date: string;
  description: string;
  key: string;
  category: SpendingCategory;
  source: SpendingCategorySource;
  /** Positive magnitude. */
  cents: number;
}

const compareDate = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function buildPeriod(spends: Spend[], from: string, to: string): SpendingPeriodDTO {
  let totalCents = 0;
  let transactionCount = 0;
  let transfersCents = 0;
  const byCategory = new Map<SpendingCategory, SpendingCategoryTotalDTO>();
  const byMerchant = new Map<string, SpendingMerchantDTO>();
  const transactions: SpendingTransactionDTO[] = [];

  // Oldest first, so the newest description names the merchant and sets its category.
  for (const s of spends) {
    if (s.date < from || s.date > to) continue;
    transactions.push({
      id: s.id,
      date: s.date,
      name: displayName(s.description) || "Unknown",
      description: s.description,
      cents: s.cents,
      category: s.category,
      source: s.source,
      merchantLearnable: s.key !== "",
    });
    if (s.category === "TRANSFERS") {
      transfersCents += s.cents;
      continue;
    }
    totalCents += s.cents;
    transactionCount += 1;

    const category = byCategory.get(s.category) ?? { category: s.category, totalCents: 0, transactionCount: 0 };
    category.totalCents += s.cents;
    category.transactionCount += 1;
    byCategory.set(s.category, category);

    const merchant = byMerchant.get(s.key) ?? { name: "", category: s.category, totalCents: 0, transactionCount: 0 };
    merchant.name = displayName(s.description) || "Unknown";
    merchant.category = s.category;
    merchant.totalCents += s.cents;
    merchant.transactionCount += 1;
    byMerchant.set(s.key, merchant);
  }

  const order = (c: SpendingCategory) => SPENDING_CATEGORIES.indexOf(c);
  return {
    from,
    to,
    totalCents,
    transactionCount,
    transfersCents,
    categories: [...byCategory.values()].sort((a, b) => b.totalCents - a.totalCents || order(a.category) - order(b.category)),
    topMerchants: [...byMerchant.values()]
      .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name))
      .slice(0, TOP_MERCHANTS),
    transactions: transactions.reverse(),
  };
}

/**
 * Whether a stored transaction is listed on the Spend Analyzer: settled money out of a bank or card
 * account, dated from the first of last month to today (the two periods buildSpending shows).
 */
export function isOnSpendAnalyzer(
  t: { date: string; amountCents: number; pending: boolean; accountKind: AccountKind },
  today: string,
): boolean {
  const { year, month } = parseIsoDate(today);
  const lastFrom = month === 1 ? formatIsoDate(year - 1, 12, 1) : formatIsoDate(year, month - 1, 1);
  return !t.pending && t.amountCents < 0 && (t.accountKind === "BANK" || t.accountKind === "CREDIT") && t.date >= lastFrom && t.date <= today;
}

export function buildSpending({ transactions, today, overrides, merchantRules }: SpendingInput): SpendingAnalysisDTO {
  const { year, month, day } = parseIsoDate(today);
  const lastYear = month === 1 ? year - 1 : year;
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastLength = daysInMonth(lastYear, lastMonth);

  const thisFrom = formatIsoDate(year, month, 1);
  const lastFrom = formatIsoDate(lastYear, lastMonth, 1);
  const lastTo = formatIsoDate(lastYear, lastMonth, lastLength);
  const lastSameDay = formatIsoDate(lastYear, lastMonth, Math.min(day, lastLength));

  const cardPayments = matchCardPayments(
    transactions.flatMap((t) => (t.accountKind ? [{ id: t.id, date: t.date, amountCents: t.amountCents, accountKind: t.accountKind }] : [])),
  );
  const spends: Spend[] = transactions
    .filter((t) => t.amountCents < 0)
    .sort((a, b) => compareDate(a.date, b.date))
    .map((t): Spend => {
      const key = merchantKey(t.description);
      return { id: t.id, date: t.date, description: t.description, key, cents: -t.amountCents, ...resolveCategory(t, key, overrides, merchantRules, cardPayments) };
    });

  const lastMonthPeriod = buildPeriod(spends, lastFrom, lastTo);
  const coverageStart = transactions.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null);

  return {
    thisMonth: buildPeriod(spends, thisFrom, today),
    lastMonth: lastMonthPeriod,
    lastMonthToDateCents: buildPeriod(spends, lastFrom, lastSameDay).totalCents,
    coverageStart,
  };
}
