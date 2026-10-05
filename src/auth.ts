import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { db } from "./db.js";
import { AppError } from "./errors.js";

type SessionPayload = { uid: string; exp: number };

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

export function signSession(userId: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  const payload: SessionPayload = { uid: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", config.appSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", config.appSecret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.uid || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return request.cookies.ml_session;
}

export async function currentUser(request: FastifyRequest) {
  const payload = readSession(sessionToken(request));
  if (!payload) return null;
  return db().user.findUnique({ where: { id: payload.uid } });
}

export async function requireUser(request: FastifyRequest) {
  const user = await currentUser(request);
  if (!user) throw new AppError(401, "unauthorized", "Нужна авторизация Telegram");
  return user;
}

export async function requireAdmin(request: FastifyRequest) {
  const user = await requireUser(request);
  if (user.role !== "admin") throw new AppError(403, "forbidden", "Панель управления доступна только администраторам");
  return user;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie("ml_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: config.production,
  });
}

export function publicUser<T extends { balance: number }>(user: T) {
  return { ...user, balance: Math.round(user.balance * 100) / 100 };
}
