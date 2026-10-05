import { buildApp } from "./app.js";
import { startBot } from "./bot.js";
import { config } from "./config.js";
import { disconnectDb } from "./db.js";
import { seed } from "../prisma/seed.js";
import { resumePreparing } from "./landings.js";

const app = await buildApp();
try {
  await seed();
} catch (error) {
  console.error("База не готова. Выполните npm run db:setup");
  console.error(error);
  process.exit(1);
}

await resumePreparing();
await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`maxlanding http://127.0.0.1:${config.port}`);

if (config.botToken) {
  await startBot();
} else {
  console.log("BOT_TOKEN пуст — бот не запущен, мини-приложение и API работают");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await disconnectDb();
    process.exit(0);
  });
}
