#!/usr/bin/env node
// vitals-watch — check Core Web Vitals against budgets, from terminal or CI.
// Usage: vitals-watch <url> [--lab] [--strategy mobile|desktop] [--json]
//        vitals-watch --config vitals-watch.json
// Env:   PSI_API_KEY (free — https://developers.google.com/speed/docs/insights/v5/get-started)

const PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

const DEFAULT_BUDGETS = { lcp: 2500, inp: 200, cls: 0.1 }; // Google's "good" thresholds

const FIELD_KEYS = {
  lcp: "LARGEST_CONTENTFUL_PAINT_MS",
  inp: "INTERACTION_TO_NEXT_PAINT",
  cls: "CUMULATIVE_LAYOUT_SHIFT_SCORE",
};
const LAB_KEYS = {
  lcp: "largest-contentful-paint",
  tbt: "total-blocking-time",
  cls: "cumulative-layout-shift",
};

const fmt = (k, v) => (k === "cls" ? v.toFixed(2) : `${Math.round(v)}ms`);
const mark = (ok) => (ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m");

async function checkPage(url, budgets, { lab, strategy }) {
  const qs = new URLSearchParams({ url, category: "performance", strategy });
  if (process.env.PSI_API_KEY) qs.set("key", process.env.PSI_API_KEY);
  const res = await fetch(`${PSI}?${qs}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const metrics = {};
  let source = "field";
  if (!lab && data.loadingExperience?.metrics) {
    const m = data.loadingExperience.metrics;
    for (const [k, fk] of Object.entries(FIELD_KEYS)) {
      if (m[fk]?.percentile != null) metrics[k] = m[fk].percentile / (k === "cls" ? 100 : 1);
    }
  }
  if (Object.keys(metrics).length < 3) {
    source = "lab";
    const a = data.lighthouseResult.audits;
    metrics.lcp = a[LAB_KEYS.lcp].numericValue;
    metrics.inp = a[LAB_KEYS.tbt].numericValue; // TBT is the lab proxy for INP
    metrics.cls = a[LAB_KEYS.cls].numericValue;
  }

  const labels = { lcp: source === "lab" ? "LCP (lab)" : "LCP", inp: source === "lab" ? "TBT→INP (lab)" : "INP", cls: "CLS" };
  const results = Object.entries(budgets).map(([k, budget]) => ({
    metric: labels[k] ?? k,
    value: metrics[k],
    budget,
    pass: metrics[k] <= budget,
  }));
  return { url, source, results, pass: results.every((r) => r.pass) };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes("--json");
  const lab = args.includes("--lab");
  const sIdx = args.indexOf("--strategy");
  const strategy = sIdx > -1 ? args[sIdx + 1] : "mobile";
  const cIdx = args.indexOf("--config");
  const single = args.find((a) => !a.startsWith("--") && !["--strategy", "--config"].includes(args[args.indexOf(a) - 1]));

  let pages;
  if (cIdx > -1) {
    const cfg = JSON.parse(await (await import("node:fs/promises")).readFile(args[cIdx + 1], "utf8"));
    pages = cfg.pages.map((p) => ({ url: p.url, budgets: { ...DEFAULT_BUDGETS, ...cfg.budgets, ...p.budgets } }));
  } else if (single) {
    const url = single.startsWith("http") ? single : `https://${single}`;
    pages = [{ url, budgets: DEFAULT_BUDGETS }];
  } else {
    console.error("Usage: vitals-watch <url> [--lab] [--strategy mobile|desktop] [--json]");
    console.error("       vitals-watch --config vitals-watch.json");
    process.exit(2);
  }

  const out = [];
  let allPass = true;
  for (const p of pages) {
    try {
      const r = await checkPage(p.url, p.budgets, { lab, strategy });
      out.push(r);
      if (!r.pass) allPass = false;
      if (!jsonOut) {
        console.log(`\n  ${r.url}  (${r.source} data, ${strategy})`);
        for (const m of r.results) {
          console.log(`  ${mark(m.pass)} ${m.metric.padEnd(14)} ${fmt(m.metric, m.value)}  (budget ${fmt(m.metric, m.budget)})`);
        }
      }
    } catch (e) {
      out.push({ url: p.url, error: e.message });
      allPass = false;
      if (!jsonOut) console.error(`\n  ${p.url}  — ${e.message}`);
    }
  }

  if (jsonOut) console.log(JSON.stringify(out, null, 2));
  else console.log(`\n  ${allPass ? "\x1b[32mAll budgets passed\x1b[0m" : "\x1b[31mBudget regressions detected\x1b[0m"}\n`);

  process.exit(allPass ? 0 : 1);
}

main();
