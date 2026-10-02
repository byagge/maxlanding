export type User = {
  id: string;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  role: string;
  balance: number;
  logIp: boolean;
  logUa: boolean;
  logReferrer: boolean;
};

export type Stats = { visits: number; downloads: number; conversion: string };

export type Template = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  price: number;
  theme: string;
  layout: string;
  previewHue: string;
  owned: boolean;
  inShop: boolean;
  defaults: { title: string; subtitle: string; button: string; features: string[] };
};

export type Domain = {
  id: string;
  hostname: string;
  status: string;
  ns1: string;
  ns2: string;
  lastError?: string | null;
  landings: Array<{ id: string; name: string; status: string; slug: string }>;
};

export type Landing = {
  id: string;
  slug: string;
  name: string;
  status: string;
  title: string;
  subtitle: string;
  buttonText: string;
  downloadUrl?: string | null;
  features: string[];
  visits?: number;
  downloads?: number;
  templateId: string;
  domainId?: string | null;
  template?: { name: string; theme: string; layout: string };
  domain?: { hostname: string; status: string } | null;
};

async function parse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Ошибка запроса");
  return data as T;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = localStorage.getItem("ml_token");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return parse<T>(await fetch(path, { ...init, headers }));
}

export function money(value: number): string {
  return `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} USDT`;
}

export function when(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
