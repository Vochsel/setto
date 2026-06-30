/**
 * Turn a function's manifest arg-spec into CLI flags, and collect flag values
 * back into a typed args object. `--args '<json>'` provides a base object that
 * individual `--field value` flags are merged on top of.
 */
import type { Command } from "commander";
import { argSpecs, type FnSpec } from "@setto/core";

const RESERVED = new Set(["json", "compact", "args", "help", "version"]);

export function addArgFlags(cmd: Command, fn: FnSpec): void {
  for (const a of argSpecs(fn.args)) {
    if (RESERVED.has(a.name)) continue;
    cmd.option(`--${a.name} <value>`, `${a.optional ? "(optional) " : ""}${a.type}`);
  }
}

/** Coerce a raw string flag value to the type implied by the validator. */
export function coerce(type: string, raw: string): unknown {
  if (type === "string" || type.startsWith("Id<")) return raw;
  if (type === "number") {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error(`expected a number, got "${raw}"`);
    return n;
  }
  if (type === "boolean") return raw === "true" || raw === "1";
  // A union of string literals (e.g. "draft" | "active") stays a string.
  if (/^\s*("[^"]*"\s*\|\s*)*"[^"]*"\s*$/.test(type)) return raw;
  // Arrays / objects / records: expect JSON.
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function collectArgs(
  fn: FnSpec,
  opts: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof opts.args === "string") Object.assign(out, JSON.parse(opts.args));
  for (const a of argSpecs(fn.args)) {
    if (RESERVED.has(a.name)) continue;
    const v = opts[a.name];
    if (v !== undefined) out[a.name] = coerce(a.type, String(v));
  }
  return out;
}
