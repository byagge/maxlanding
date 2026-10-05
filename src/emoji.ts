import type { InlineKeyboardButton, InlineKeyboardMarkup } from "@grammyjs/types";

export type MenuItem = {
  label: string;
  fallback: string;
  icon: string;
  screen: string;
  style?: "primary" | "success";
};

const ICONS = {
  create: "5312016608254762256",
  domains: "5312486108309757006",
  examples: "5350481781306958339",
  logs: "5350305691942788490",
  invite: "5386435923204382258",
  support: "5417915203100613993",
  admin: "5357107601584693888",
};

export function menuRows(isAdmin: boolean): MenuItem[][] {
  const rows: MenuItem[][] = [
    [{ label: "Создать ссылку", fallback: "⚡️ Создать ссылку", icon: ICONS.create, screen: "create", style: "primary" }],
    [{ label: "Домены", fallback: "🏠 Домены", icon: ICONS.domains, screen: "domains" }],
    [{ label: "Примеры лендингов", fallback: "📚 Примеры лендингов", icon: ICONS.examples, screen: "examples" }],
    [
      { label: "Логи", fallback: "📈 Логи", icon: ICONS.logs, screen: "logs" },
      { label: "Пригласить", fallback: "👨‍👩‍👧‍👦 Пригласить", icon: ICONS.invite, screen: "invite", style: "success" }],
    [{ label: "Поддержка", fallback: "💬 Поддержка", icon: ICONS.support, screen: "support" }],
  ];
  if (isAdmin) rows.push([{ label: "Панель управления", fallback: "👑 Панель управления", icon: ICONS.admin, screen: "admin" }]);
  return rows;
}

export function menuMarkup(isAdmin: boolean, premium: boolean, webappBase: string): InlineKeyboardMarkup {
  const web = webappBase.replace(/\/$/, "");
  return {
    inline_keyboard: menuRows(isAdmin).map((row) => row.map((item): InlineKeyboardButton => {
      const text = premium ? item.label : item.fallback;
      const extra = {
        ...(item.style && premium ? { style: item.style } : {}),
        ...(premium ? { icon_custom_emoji_id: item.icon } : {}),
      };
      if (web) return { text, ...extra, web_app: { url: `${web}?screen=${item.screen}` } };
      return { text, ...extra, callback_data: `go:${item.screen}` };
    })),
  };
}

export function isPremiumEmojiError(error: unknown): boolean {
  const bag = error as { description?: string; message?: string; error?: { description?: string } };
  const text = `${bag.description || ""} ${bag.message || ""} ${bag.error?.description || ""}`;
  return /custom emoji|icon_custom_emoji|premium subscription|BUTTON_STYLE|emoji identifier/i.test(text);
}
