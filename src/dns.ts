import { Resolver } from "node:dns/promises";
import { AppError } from "./errors.js";

const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

export function normalizeHostname(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0]?.split(":")[0]?.replace(/\.$/, "") ?? "";
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) {
    throw new AppError(400, "bad_domain", "Введите домен вида landing.example.com");
  }
  return value;
}

export function nsMatches(actual: string[], expected: string[]): boolean {
  const got = new Set(actual.map((item) => item.toLowerCase().replace(/\.$/, "")));
  return expected.every((item) => got.has(item.toLowerCase().replace(/\.$/, "")));
}

export function decideDomain(input: {
  actualNs: string[];
  actualA: string[];
  expectedNs: string[];
  platformIp: string;
}): { ok: boolean; status: "active" | "pending_ns" | "mismatch"; message: string } {
  if (nsMatches(input.actualNs, input.expectedNs)) {
    return { ok: true, status: "active", message: "NS-серверы совпали, домен подключён." };
  }
  if (input.platformIp && input.actualA.includes(input.platformIp)) {
    return { ok: true, status: "active", message: "A-запись указывает на платформу, домен подключён." };
  }
  if (input.actualNs.length === 0 && input.actualA.length === 0) {
    return { ok: false, status: "pending_ns", message: "Записи ещё не видны. Проверьте NS у регистратора и повторите через несколько минут." };
  }
  const current = input.actualNs.length ? input.actualNs.join(", ") : "не найдены";
  return {
    ok: false,
    status: "mismatch",
    message: `Сейчас NS: ${current}. Нужны ${input.expectedNs.join(" и ")}.`,
  };
}

export async function lookupDomain(hostname: string): Promise<{ ns: string[]; a: string[] }> {
  const [nsResult, aResult] = await Promise.allSettled([resolver.resolveNs(hostname), resolver.resolve4(hostname)]);
  return {
    ns: nsResult.status === "fulfilled" ? nsResult.value : [],
    a: aResult.status === "fulfilled" ? aResult.value : [],
  };
}
