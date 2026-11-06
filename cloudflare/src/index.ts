import { CATEGORY_LABEL, DRINKS, OIL_LABEL, type Drink } from "../../src/data/drinks";
import { simulateWithRef, type SimOptions, type SimResult } from "../../src/lib/insulin";

type Env = Record<string, never>;

type Body = {
  id?: string;
  ml?: number;
  fasted?: boolean;
  sensitivity?: number;
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, app: "insulinsimulator" });
    }

    if (url.pathname === "/api/drinks") {
      return Response.json({
        count: DRINKS.length,
        drinks: DRINKS.map((drink) => ({
          id: drink.id,
          name: drink.name,
          brand: drink.brand,
          category: drink.category,
          oil: drink.oil,
          chocolate: drink.chocolate,
          organic: drink.organic,
          addedSugarPer100: drink.addedSugarPer100,
        })),
      });
    }

    if (url.pathname === "/api/simulate" && request.method === "POST") {
      let body: Body = {};
      try {
        body = (await request.json()) as Body;
      } catch {
        return Response.json({ error: "json" }, { status: 400 });
      }
      const drink = DRINKS.find((item) => item.id === body.id);
      if (!drink) return Response.json({ error: "unknown drink" }, { status: 404 });
      const ml = clamp(Number(body.ml ?? 300), 50, 800);
      const sensitivity = clamp(Number(body.sensitivity ?? 1), 0.5, 1.8);
      const sim = simulateWithRef(drink, {
        ml,
        fasted: body.fasted !== false,
        sensitivity,
      });
      return Response.json({
        id: drink.id,
        name: drink.name,
        brand: drink.brand,
        ml,
        load: sim.load,
        peakInsulin: sim.peakInsulin,
        peakGlucose: sim.peakGlucose,
        timeToPeak: sim.timeToPeak,
        gl: sim.gl,
        sugars: sim.sugars,
        points: sim.points,
      });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(renderPage(url), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("not found", { status: 404 });
  },
};

function renderPage(url: URL): string {
  const dl = clamp(Number(url.searchParams.get("dl") ?? 3), 1, 5);
  const ml = Math.round(dl * 100);
  const fasted = url.searchParams.get("fasted") !== "0";
  const sensitivity = clamp(Number(url.searchParams.get("k") ?? 1), 0.5, 1.8);
  const options: SimOptions = { ml, fasted, sensitivity };
  const cat = url.searchParams.get("kat") ?? "alla";
  const oil = url.searchParams.get("olja") ?? "alla";
  const id = url.searchParams.get("id") ?? "oatly-ikaffe";

  const ranked = DRINKS.map((drink) => ({ drink, sim: simulateWithRef(drink, options) })).sort(
    (a, b) => b.sim.load - a.sim.load,
  );
  const visible = ranked.filter(({ drink }) => {
    if (cat !== "alla" && drink.category !== cat) return false;
    if (oil !== "alla" && drink.oil !== oil) return false;
    return true;
  });
  const current = ranked.find((row) => row.drink.id === id) ?? ranked.find((row) => row.drink.id === "oatly-ikaffe")!;
  const cola = ranked.find((row) => row.drink.id === "cola")!;
  const high = visible.slice(0, 10);
  const low = [...visible].reverse().slice(0, 10);

  const href = (extra: Record<string, string>) => {
    const q = new URLSearchParams({
      id: current.drink.id,
      dl: String(dl),
      fasted: fasted ? "1" : "0",
      k: String(sensitivity),
      kat: cat,
      olja: oil,
      ...extra,
    });
    return `/?${q.toString()}`;
  };

  const rows = visible
    .map(({ drink, sim }) => {
      const on = drink.id === current.drink.id;
      return `<a class="row${on ? " on" : ""}" href="${href({ id: drink.id })}"><span><small>${esc(drink.brand)} · ${esc(OIL_LABEL[drink.oil])}</small>${esc(drink.name)}</span><b>${Math.round(sim.load)}</b></a>`;
    })
    .join("");

  const chips = (items: [string, string, string][]) =>
    items
      .map(([key, value, label]) => {
        const pressed = (key === "kat" ? cat : oil) === value;
        return `<a class="chip${pressed ? " on" : ""}" href="${href({ [key]: value })}">${esc(label)}</a>`;
      })
      .join("");

  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Insulinsimulator</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #10140f; color: #e8eedf; font: 16px/1.45 Outfit, ui-sans-serif, system-ui, sans-serif; }
  header, main, section { max-width: 1100px; margin: 0 auto; padding: 20px; }
  h1 { font-family: Georgia, serif; font-weight: 500; font-size: 40px; margin: 0; }
  h2 { font-family: Georgia, serif; font-weight: 500; }
  a { color: inherit; }
  .muted { color: #9aa392; }
  .lime { color: #d6f25c; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  .chip, button, .row { min-height: 44px; }
  .chip { display: inline-flex; align-items: center; padding: 0 12px; background: #21291d; border-radius: 8px; text-decoration: none; }
  .chip.on { background: #d6f25c; color: #10140f; }
  .layout { display: grid; grid-template-columns: 280px 1fr; gap: 20px; }
  .list { display: flex; flex-direction: column; border: 1px solid #2c3628; border-radius: 8px; max-height: 80vh; overflow: auto; }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 10px 12px; text-decoration: none; border-bottom: 1px solid #2c3628; }
  .row.on { background: #21291d; }
  .row small { display: block; color: #9aa392; }
  .row b { color: #d6f25c; font-family: Georgia, serif; font-size: 22px; }
  .card { background: #171d15; border: 1px solid #2c3628; border-radius: 8px; padding: 16px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .stats div { background: #21291d; border-radius: 8px; padding: 10px; }
  .stats b { display: block; font-family: Georgia, serif; font-size: 26px; }
  svg { width: 100%; height: auto; }
  ol { list-style: none; padding: 0; margin: 0; }
  ol a { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #2c3628; text-decoration: none; }
  @media (max-width: 800px) {
    .layout, .stats, .ranks { grid-template-columns: 1fr; }
    .list { max-height: none; }
  }
  .ranks { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
</style>
</head>
<body>
<header>
  <p class="muted">Cloudflare Worker · Sverige · fastande morgon</p>
  <h1>Insulinsimulator</h1>
  <p class="muted">Samma modell som appen. Belastning 100 = lika stort glas Coca-Cola. Inte en insulindos.</p>
  <div class="bar">
    <a class="chip${dl === 2 ? " on" : ""}" href="${href({ dl: "2" })}">2 dl</a>
    <a class="chip${dl === 3 ? " on" : ""}" href="${href({ dl: "3" })}">3 dl</a>
    <a class="chip${dl === 4 ? " on" : ""}" href="${href({ dl: "4" })}">4 dl</a>
    <a class="chip${fasted ? " on" : ""}" href="${href({ fasted: "1" })}">Fastande</a>
    <a class="chip${!fasted ? " on" : ""}" href="${href({ fasted: "0" })}">Med frukost</a>
    <a class="chip${sensitivity === 0.75 ? " on" : ""}" href="${href({ k: "0.75" })}">Låg</a>
    <a class="chip${sensitivity === 1 ? " on" : ""}" href="${href({ k: "1" })}">Typisk</a>
    <a class="chip${sensitivity === 1.35 ? " on" : ""}" href="${href({ k: "1.35" })}">Hög</a>
  </div>
  <div class="bar">
    ${chips([
      ["kat", "alla", "Alla"],
      ...Object.entries(CATEGORY_LABEL).map(([key, label]) => ["kat", key, label] as [string, string, string]),
    ])}
  </div>
  <div class="bar">
    ${chips([
      ["olja", "alla", "All olja"],
      ...Object.entries(OIL_LABEL).map(([key, label]) => ["olja", key, label] as [string, string, string]),
    ])}
  </div>
</header>
<main class="layout">
  <nav class="list">${rows}</nav>
  <article class="card">
    <p class="muted">${esc(current.drink.brand)}</p>
    <h2>${esc(current.drink.name)}</h2>
    <p class="muted">${esc(current.drink.note)}</p>
    <div class="stats">
      <div><span class="muted">Belastning</span><b class="lime">${Math.round(current.sim.load)}</b></div>
      <div><span class="muted">Topp insulin</span><b>${current.sim.peakInsulin}</b><span class="muted">µU/ml · ${current.sim.timeToPeak} min</span></div>
      <div><span class="muted">Topp glukos</span><b>+${current.sim.peakGlucose}</b><span class="muted">mg/dl</span></div>
      <div><span class="muted">Socker</span><b>${current.sim.sugars} g</b><span class="muted">${current.sim.kcal} kcal</span></div>
    </div>
    ${chartSvg(current, cola)}
    <p class="muted">Heldragen lime är ${esc(current.drink.name)}. Streckad är Coca-Cola i samma glas, referens 100.</p>
  </article>
</main>
<section class="ranks">
  <div><h2>Tio tyngsta</h2>${rankList(high, href)}</div>
  <div><h2>Tio lättaste</h2>${rankList(low, href)}</div>
</section>
</body>
</html>`;
}

function rankList(
  rows: { drink: Drink; sim: SimResult }[],
  href: (extra: Record<string, string>) => string,
): string {
  return `<ol>${rows
    .map(
      (row, i) =>
        `<li><a href="${href({ id: row.drink.id })}"><span>${i + 1}. ${esc(row.drink.brand)} ${esc(row.drink.name)}</span><b class="lime">${Math.round(row.sim.load)}</b></a></li>`,
    )
    .join("")}</ol>`;
}

function chartSvg(
  current: { drink: Drink; sim: SimResult },
  cola: { drink: Drink; sim: SimResult },
): string {
  const w = 640;
  const h = 280;
  const pad = 28;
  const maxI = Math.max(
    10,
    ...current.sim.points.map((p) => p.insulin),
    ...cola.sim.points.map((p) => p.insulin),
  );
  const line = (pts: SimResult["points"], key: "insulin") =>
    pts
      .map((p, i) => {
        const x = pad + (p.t / 180) * (w - pad * 2);
        const y = h - pad - (p[key] / maxI) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Insulinkurva">
    <rect width="${w}" height="${h}" fill="#171d15"/>
    <path d="${line(cola.sim.points, "insulin")}" fill="none" stroke="#e3a06a" stroke-dasharray="5 4" stroke-width="2"/>
    <path d="${line(current.sim.points, "insulin")}" fill="none" stroke="#d6f25c" stroke-width="2.5"/>
  </svg>`;
}

function esc(value: string): string {
  return value
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;");
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
