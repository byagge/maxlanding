export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatUsdt(value: number): string {
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(money(value))} USDT`;
}

export function formatPercent(visits: number, downloads: number): string {
  if (!visits) return "0%";
  const value = Math.round((downloads / visits) * 1000) / 10;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toString()}%`;
}

export function pageQuery(input: { page?: unknown; pageSize?: unknown }, fallbackSize = 8): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(input.pageSize) || fallbackSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
