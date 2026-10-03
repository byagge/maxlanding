import { existsSync } from "node:fs";
import path from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { isPlatformHost } from "./config.js";
import { getSettings } from "./settings.js";
import { db } from "./db.js";
import { AppError, isAppError } from "./errors.js";
import { parseFeatures } from "./landings.js";
import { registerApi } from "./api.js";
import { renderLanding, type LandingView } from "./render.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export function landingView(input: {
  slug: string;
  name: string;
  title: string;
  subtitle: string;
  buttonText: string;
  downloadUrl: string | null;
  features: string;
  template: { theme: string; layout: string };
}): LandingView {
  return {
    slug: input.slug,
    name: input.name,
    title: input.title,
    subtitle: input.subtitle,
    buttonText: input.buttonText,
    downloadUrl: input.downloadUrl,
    features: parseFeatures(input.features),
    theme: input.template.theme,
    layout: input.template.layout,
  };
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV === "test" ? false : { level: "info" }, trustProxy: true });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const text = typeof body === "string" ? body : "";
    request.rawBody = text;
    if (!text) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: "validation", message: error.issues[0]?.message || "Проверьте поля" } });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) return reply.code(statusCode).send({ error: { code: "bad_request", message: "Некорректный запрос" } });
    request.log.error(error);
    return reply.code(500).send({ error: { code: "internal", message: "Внутренняя ошибка" } });
  });

  app.addHook("onRequest", async (request, reply) => {
    const host = (request.headers.host || "").split(":")[0]?.toLowerCase() || "";
    if (!host || request.url.startsWith("/api") || request.url.startsWith("/l/") || request.url.startsWith("/t/")) return;
    const settings = await getSettings();
    if (isPlatformHost(host, settings.platformDomain)) return;
    const suffix = settings.platformDomain ? `.${settings.platformDomain}` : "";
    const label = suffix && host.endsWith(suffix) ? host.slice(0, -suffix.length) : "";
    const landing = await db().landing.findFirst({
      where: {
        status: "active",
        OR: [...(label && !label.includes(".") ? [{ subdomain: label }] : []), { customHost: host, customStatus: "active" }],
      },
      include: { template: true },
    });
    if (!landing) return;
    return reply.type("text/html; charset=utf-8").send(renderLanding(landingView(landing), true));
  });

  await registerApi(app);
  registerPages(app);

  const webDist = path.resolve("dist/web");
  if (existsSync(path.join(webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api")) return reply.code(404).send({ error: { code: "not_found", message: "Не найдено" } });
      if (request.url.startsWith("/l/") || request.url.startsWith("/t/")) return reply.code(404).type("text/plain; charset=utf-8").send("Страница не найдена");
      return reply.sendFile("index.html");
    });
  }

  return app;
}

function registerPages(app: FastifyInstance): void {
  app.get("/l/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const landing = await db().landing.findFirst({ where: { slug, status: "active" }, include: { template: true } });
    if (!landing) throw new AppError(404, "not_found", "Лендинг не опубликован");
    return reply.type("text/html; charset=utf-8").send(renderLanding(landingView(landing), true));
  });

  app.get("/t/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const template = await db().template.findFirst({ where: { slug, published: true } });
    if (!template) throw new AppError(404, "not_found", "Пример не найден");
    const defaults = JSON.parse(template.defaults) as { title?: string; subtitle?: string; button?: string; features?: string[] };
    const view: LandingView = {
      slug: template.slug,
      name: template.name,
      title: defaults.title || template.name,
      subtitle: defaults.subtitle || template.description,
      buttonText: defaults.button || "Открыть",
      downloadUrl: null,
      features: defaults.features || [],
      theme: template.theme,
      layout: template.layout,
    };
    return reply.type("text/html; charset=utf-8").send(renderLanding(view, false));
  });
}

export function clientIp(request: FastifyRequest): string {
  return request.ip || "0.0.0.0";
}
