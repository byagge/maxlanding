export type LandingView = {
  slug: string;
  name: string;
  title: string;
  subtitle: string;
  buttonText: string;
  downloadUrl: string | null;
  features: string[];
  theme: string;
  layout: string;
  pixelUrl?: string | null;
};

export function pixelImage(url?: string | null): string {
  if (!url || !url.startsWith("https://")) return "";
  return `<img src="${url.replace(/"/g, "")}" width="1" height="1" alt="" style="position:absolute;left:-9999px">`;
}

export function trackingScript(slug: string, pixelUrl?: string | null): string {
  return `<script>
const slug=${JSON.stringify(slug)};
const session=(sessionStorage.getItem("ml_s")||String(Date.now()));
sessionStorage.setItem("ml_s", session);
const params=new URLSearchParams(location.search);
let source=params.get("utm_source")||"";
if(!source){try{source=document.referrer?new URL(document.referrer).host:"direct"}catch(e){source=document.referrer?"referral":"direct"}}
const started=Date.now();
function hit(type, extra){return fetch("/api/public/hit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.assign({slug,type,session,source}, extra||{})),keepalive:true}).catch(()=>{})}
hit("visit");
setInterval(()=>hit("heartbeat",{duration:Math.round((Date.now()-started)/1000)}),15000);
document.addEventListener("click",(event)=>{const el=event.target&&event.target.closest?event.target.closest("a,button,[data-track]"):null;if(!el||el.matches("input,textarea,select"))return;hit("click",{element:el.getAttribute("data-track")||el.id||el.tagName})},true);
document.querySelector("[data-download]")?.addEventListener("click",(event)=>{event.preventDefault();const href=event.currentTarget.getAttribute("href");hit("download").finally(()=>{if(href)location.href=href})});
</script>${pixelImage(pixelUrl)}`;
}

export function renderUploaded(html: string, options: { slug: string; pixelUrl?: string | null; track: boolean }): string {
  const extra = options.track ? trackingScript(options.slug, options.pixelUrl) : pixelImage(options.pixelUrl);
  if (html.includes("</body>")) return html.replace("</body>", `${extra}</body>`);
  return `${html}${extra}`;
}

const themes: Record<string, { bg: string; ink: string; muted: string; accent: string; card: string; glow: string; light: boolean }> = {
  aurora: { bg: "#090b14", ink: "#f6f7fb", muted: "#b7c0d8", accent: "#8b7cff", card: "rgba(255,255,255,.06)", glow: "#5b8cff", light: false },
  pulse: { bg: "#07110f", ink: "#f3fffb", muted: "#b7d5cc", accent: "#3ee0b0", card: "rgba(255,255,255,.06)", glow: "#1f8f86", light: false },
  linen: { bg: "#f6f1e8", ink: "#221c16", muted: "#6e6256", accent: "#9a5b32", card: "#fffaf3", glow: "#e7d3bb", light: true },
  noir: { bg: "#0a0a0a", ink: "#f7f3ea", muted: "#b7b0a4", accent: "#d6b36a", card: "rgba(255,255,255,.05)", glow: "#6d5428", light: false },
  harbor: { bg: "#0d1724", ink: "#f4f7fb", muted: "#b7c3d4", accent: "#7eb6ff", card: "rgba(255,255,255,.05)", glow: "#1d4e89", light: false },
  ember: { bg: "#1a0d09", ink: "#fff6ef", muted: "#e2c3b2", accent: "#ff8a4c", card: "rgba(255,255,255,.06)", glow: "#8a3418", light: false },
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

function stage(view: LandingView, card: string, accent: string): string {
  const items = (view.features.length ? view.features : ["Старт", "Страница", "Файл"]).slice(0, 3);
  if (view.layout === "saas") {
    return `<div class="tiles">${items.map((item, index) => `<article><b>0${index + 1}</b><span>${esc(item)}</span></article>`).join("")}</div>`;
  }
  if (view.layout === "course") {
    return `<ol class="lessons">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>`;
  }
  if (view.layout === "portfolio") {
    return `<div class="works">${items.map((item) => `<div class="work"><span>${esc(item)}</span></div>`).join("")}</div>`;
  }
  if (view.layout === "local") {
    return `<div class="place"><strong>Сегодня открыто</strong><span>${esc(items[0] || "Центр города")}</span><span>${esc(items[1] || "Без очереди")}</span></div>`;
  }
  if (view.layout === "product") {
    return `<div class="product"><em>${esc(view.name)}</em><strong>${esc(items[0] || "Лимитированная серия")}</strong></div>`;
  }
  return `<div class="phone" style="background:${card};box-shadow:0 24px 70px ${accent}33"></div>`;
}

export function renderLanding(view: LandingView, track: boolean): string {
  const theme = themes[view.theme] || themes.aurora;
  const features = (view.features.length ? view.features : ["Быстрый старт", "Своя ссылка на файл", "Домен или адрес платформы"]).map((item) => `<li>${esc(item)}</li>`).join("");
  const href = view.downloadUrl ? esc(view.downloadUrl) : "";
  const button = href
    ? `<a class="cta" data-download href="${href}">${esc(view.buttonText)}</a>`
    : `<span class="cta is-disabled">${esc(view.buttonText)}</span>`;
  const script = track ? trackingScript(view.slug, view.pixelUrl) : pixelImage(view.pixelUrl);
  return `<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(view.title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Manrope,ui-sans-serif,system-ui,sans-serif;background:${theme.bg};color:${theme.ink}}
.wrap{min-height:100vh;display:grid;place-items:center;padding:28px 18px;background:radial-gradient(900px 420px at 8% -10%, ${theme.glow}, transparent 55%),radial-gradient(700px 380px at 110% 0%, ${theme.accent}33, transparent 46%)}
.card{width:min(980px,100%);display:grid;grid-template-columns:1.15fr .85fr;gap:28px;align-items:center}
.kicker{letter-spacing:.16em;text-transform:uppercase;font-size:12px;color:${theme.muted}}
h1{font-size:clamp(40px,6vw,72px);line-height:.95;margin:12px 0}
p{font-size:18px;line-height:1.5;color:${theme.muted}}
ul{padding:0;margin:18px 0 26px;list-style:none;display:grid;gap:8px}
li{padding:10px 12px;border-radius:14px;background:${theme.card}}
.cta{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 22px;border-radius:999px;background:${theme.accent};color:${theme.light ? "#fff" : "#111"};text-decoration:none;font-weight:800}
.is-disabled{opacity:.55}
.stage{min-height:440px;border-radius:32px;background:${theme.card};border:1px solid ${theme.accent}44;position:relative;overflow:hidden;display:grid;place-items:center;padding:22px}
.phone{width:190px;height:340px;border-radius:32px;border:1px solid ${theme.accent}}
.tiles,.works{display:grid;gap:12px;width:100%}
.tiles article,.work,.place{padding:16px;border-radius:18px;background:${theme.bg};border:1px solid ${theme.accent}33}
.lessons{margin:0;display:grid;gap:10px;width:100%}
.lessons li{background:${theme.bg}}
.product{text-align:center}
.product em{display:block;font-style:normal;letter-spacing:.2em;text-transform:uppercase;color:${theme.muted}}
.product strong{display:block;font-size:40px;margin-top:12px}
.badge{position:absolute;left:20px;bottom:16px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${theme.muted}}
@media(max-width:800px){.card{grid-template-columns:1fr}.stage{min-height:260px}}
</style>
<body>
<main class="wrap">
  <section class="card">
    <div>
      <div class="kicker">${esc(view.name)}</div>
      <h1>${esc(view.title)}</h1>
      <p>${esc(view.subtitle)}</p>
      <ul>${features}</ul>
      ${button}
    </div>
    <div class="stage">${stage(view, theme.card, theme.accent)}<div class="badge">MaxLanding</div></div>
  </section>
</main>
${script}
</html>`;
}
