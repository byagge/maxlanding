import { db } from "../src/db.js";
import { ensureSettings } from "../src/settings.js";

const templates = [
  {
    slug: "aurora-app",
    name: "Аврора",
    description: "Тёмный экран приложения с одной кнопкой скачивания.",
    category: "Приложение",
    price: 0,
    theme: "aurora",
    layout: "app",
    previewHue: "#8b7cff",
    inShop: false,
    defaults: {
      title: "Приложение, которое ставится в один тап",
      subtitle: "Короткий лендинг для вашего файла: заголовок, смысл и кнопка скачивания.",
      button: "Скачать",
      features: ["Один экран", "Своя ссылка на файл", "Счётчик переходов"],
    },
  },
  {
    slug: "pulse-saas",
    name: "Пульс",
    description: "Запуск сервиса: обещание, три пункта и кнопка.",
    category: "Сервис",
    price: 0,
    theme: "pulse",
    layout: "saas",
    previewHue: "#3ee0b0",
    inShop: false,
    defaults: {
      title: "Сервис, который объясняет себя сразу",
      subtitle: "Светящийся экран для продукта, листа ожидания или раннего доступа.",
      button: "Открыть",
      features: ["Понятный оффер", "Три преимущества", "Кнопка действия"],
    },
  },
  {
    slug: "linen-course",
    name: "Лён",
    description: "Спокойная страница курса или набора уроков.",
    category: "Обучение",
    price: 0,
    theme: "linen",
    layout: "course",
    previewHue: "#9a5b32",
    inShop: false,
    defaults: {
      title: "Курс, который хочется открыть",
      subtitle: "Тёплый экран с программой и кнопкой записи или скачивания материалов.",
      button: "Начать",
      features: ["Программа", "Для кого", "Что внутри"],
    },
  },
  {
    slug: "noir-product",
    name: "Нуар",
    description: "Премиальный экран продукта.",
    category: "Продукт",
    price: 0,
    theme: "noir",
    layout: "product",
    previewHue: "#d6b36a",
    inShop: false,
    defaults: {
      title: "Вещь, которую показывают молча",
      subtitle: "Тёмный премиум-экран для дропа, мерча или закрытой поставки.",
      button: "Забрать",
      features: ["Тираж", "Доставка", "Закрытый доступ"],
    },
  },
  {
    slug: "harbor-portfolio",
    name: "Гавань",
    description: "Портфолио с тремя работами.",
    category: "Портфолио",
    price: 0,
    theme: "harbor",
    layout: "portfolio",
    previewHue: "#7eb6ff",
    inShop: false,
    defaults: {
      title: "Работы, которые говорят раньше текста",
      subtitle: "Собранный экран для студии, фриланса или небольшого агентства.",
      button: "Смотреть",
      features: ["Проект один", "Проект два", "Проект три"],
    },
  },
  {
    slug: "ember-local",
    name: "Уголь",
    description: "Страница локального места.",
    category: "Место",
    price: 0,
    theme: "ember",
    layout: "local",
    previewHue: "#ff8a4c",
    inShop: false,
    defaults: {
      title: "Место, куда приходят по одной ссылке",
      subtitle: "Экран для студии, точки или события: адрес, время и кнопка.",
      button: "Как добраться",
      features: ["Центр города", "Без очереди", "До позднего вечера"],
    },
  },
];

export async function seed(): Promise<void> {
  await ensureSettings();
  for (const template of templates) {
    await db().template.upsert({
      where: { slug: template.slug },
      create: { ...template, defaults: JSON.stringify(template.defaults), published: true },
      update: {
        name: template.name,
        description: template.description,
        category: template.category,
        theme: template.theme,
        layout: template.layout,
        previewHue: template.previewHue,
        price: template.price,
        inShop: template.inShop,
        defaults: JSON.stringify(template.defaults),
      },
    });
  }
  const admin = await db().user.upsert({
    where: { telegramId: "10000" },
    create: { telegramId: "10000", firstName: "Админ", username: "maxadmin", role: "admin", balance: 250 },
    update: { role: "admin" },
  });
  await db().user.upsert({
    where: { telegramId: "20000" },
    create: { telegramId: "20000", firstName: "Демо", username: "demo_user", role: "user", balance: 0 },
    update: {},
  });
  const aurora = await db().template.findUniqueOrThrow({ where: { slug: "aurora-app" } });
  await db().landing.upsert({
    where: { slug: "demo" },
    create: {
      userId: admin.id,
      templateId: aurora.id,
      slug: "demo",
      subdomain: "ldng1",
      name: "Демо Аврора",
      status: "active",
      title: "Демо-лендинг MaxLanding",
      subtitle: "Так выглядит запущенная страница. Кнопка считает скачивание и открывает файл.",
      buttonText: "Скачать",
      downloadUrl: "https://example.com/app.apk",
      features: JSON.stringify(["Живой пример", "Счётчик скачиваний", "Можно заменить тексты"]),
    },
    update: {},
  });
  await db().landing.updateMany({ where: { slug: "demo", subdomain: null }, data: { subdomain: "ldng1" } });
}

const isDirectRun = process.argv[1]?.includes("seed");
if (isDirectRun) {
  seed()
    .then(() => db().$disconnect())
    .catch(async (error) => {
      console.error(error);
      await db().$disconnect();
      process.exit(1);
    });
}
