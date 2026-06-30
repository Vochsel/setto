/**
 * `setto` — a discoverable CLI over the entire product surface.
 *
 * Every public Convex function is exposed as `setto <domain> <fn>` (plus a
 * generic `setto call <path>`), all derived from the shared manifest in
 * @setto/core. Output is JSON by design so an LLM agent (or any script) can
 * drive it; `setto describe` dumps the machine-readable surface.
 */
import { Command } from "commander";
import {
  login,
  logout,
  whoami,
  call,
  getConfig,
  setConfig,
  manifest,
  domains,
  byDomain,
  signature,
  nameOf,
} from "@setto/core";
import { addArgFlags, collectArgs } from "./args";

function output(result: unknown, opts: { compact?: boolean }): void {
  if (result === undefined) {
    console.log("ok");
    return;
  }
  console.log(JSON.stringify(result, null, opts.compact ? 0 : 2));
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const program = new Command();
program
  .name("setto")
  .description(
    "Setto — drive the entire product from your terminal.\n" +
      "Output is JSON; run `setto describe` to explore the whole surface.",
  )
  .version("0.1.0");

/* ── auth ──────────────────────────────────────────────────────────────── */

program
  .command("login")
  .description("Log in through the browser")
  .option("--web <url>", "override the web app URL")
  .action(async (o: { web?: string }) => {
    const creds = await login(o.web ? { webUrl: o.web } : {});
    console.error(`Logged in as ${creds.user.email ?? creds.user.id}`);
  });

program
  .command("logout")
  .description("Remove stored credentials")
  .action(() => {
    logout();
    console.error("Logged out.");
  });

program
  .command("whoami")
  .description("Show the logged-in user")
  .action(() => {
    const u = whoami();
    if (!u) fail("Not logged in. Run `setto login`.");
    console.log(JSON.stringify(u, null, 2));
  });

/* ── config ────────────────────────────────────────────────────────────── */

const config = program
  .command("config")
  .description("View or set CLI config (convexUrl, webUrl)");
config
  .command("show", { isDefault: true })
  .description("Print the resolved config")
  .action(() => console.log(JSON.stringify(getConfig(), null, 2)));
config
  .command("set <key> <value>")
  .description("Set convexUrl or webUrl")
  .action((key: string, value: string) => {
    if (key !== "convexUrl" && key !== "webUrl")
      fail("key must be convexUrl or webUrl");
    console.log(JSON.stringify(setConfig({ [key]: value }), null, 2));
  });

/* ── describe (the agent-explorable surface) ───────────────────────────── */

program
  .command("describe [domain]")
  .description("List the product surface; --json for the raw manifest")
  .option("--json", "output the raw machine-readable manifest")
  .action((domain: string | undefined, o: { json?: boolean }) => {
    const fns = domain ? byDomain(domain) : manifest;
    if (o.json) {
      console.log(JSON.stringify(fns, null, 2));
      return;
    }
    if (!domain) {
      console.log("Domains (run `setto describe <domain>`):\n");
      for (const d of domains())
        console.log(`  ${d.padEnd(20)} ${byDomain(d).length} function(s)`);
      return;
    }
    if (!fns.length) fail(`No such domain: ${domain}`);
    for (const f of fns) console.log("  " + signature(f));
  });

/* ── generic call ──────────────────────────────────────────────────────── */

program
  .command("call <path>")
  .description('Call any function by path, e.g. "campaigns:list"')
  .option("--args <json>", "arguments as a JSON object")
  .option("--compact", "single-line JSON output")
  .action(
    async (path: string, o: { args?: string; compact?: boolean }) => {
      const args = o.args ? JSON.parse(o.args) : {};
      output(await call(path, args, { interactive: true }), o);
    },
  );

/* ── one command group per domain, generated from the manifest ─────────── */

for (const domain of domains()) {
  const group = program
    .command(domain)
    .description(`${byDomain(domain).length} ${domain} function(s)`);
  for (const fn of byDomain(domain)) {
    const sub = group
      .command(nameOf(fn.path))
      .description(`${fn.type} — ${signature(fn)}`)
      .option("--args <json>", "arguments as JSON (merged with flags)")
      .option("--compact", "single-line JSON output");
    addArgFlags(sub, fn);
    sub.action(async (o: Record<string, unknown>) => {
      const args = collectArgs(fn, o);
      output(await call(fn.path, args, { interactive: true }), {
        compact: Boolean(o.compact),
      });
    });
  }
}

program.parseAsync(process.argv).catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
