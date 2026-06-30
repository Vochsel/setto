/**
 * The product surface, derived from Convex's own function spec
 * (packages/core/manifest.json, regenerated with `pnpm manifest`).
 *
 * Every public Convex function is one entry: its path, type (Query/Mutation/
 * Action) and the Convex validator JSON for its args + returns. This single
 * source drives the CLI commands, `setto describe`, and the MCP tools — so the
 * whole surface is self-describing and stays in sync with the backend.
 */
import manifestJson from "../manifest.json";

export type FnType = "Query" | "Mutation" | "Action";

/** A Convex validator as emitted by `convex function-spec` (recursive). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Validator = any;

export interface FnSpec {
  /** Colon path, e.g. "campaigns:list". */
  path: string;
  type: FnType;
  /** Object validator: { type:"object", value:{ field:{fieldType,optional} } }. */
  args: Validator | null;
  returns: Validator | null;
}

export const manifest: FnSpec[] = manifestJson as FnSpec[];

/** The module ("domain") part of a path: "campaigns" from "campaigns:list". */
export function domainOf(path: string): string {
  return path.split(":")[0];
}

/** The function part: "list" from "campaigns:list". */
export function nameOf(path: string): string {
  return path.split(":")[1] ?? path;
}

export function findFn(path: string): FnSpec | undefined {
  return manifest.find((f) => f.path === path);
}

export function domains(): string[] {
  return [...new Set(manifest.map((f) => domainOf(f.path)))].sort();
}

export function byDomain(domain: string): FnSpec[] {
  return manifest.filter((f) => domainOf(f.path) === domain);
}

/** Render a validator to a short TypeScript-ish type string. */
export function validatorToString(v: Validator): string {
  if (!v || typeof v !== "object") return "any";
  switch (v.type) {
    case "null":
      return "null";
    case "number":
      return "number";
    case "bigint":
      return "bigint";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    case "bytes":
      return "bytes";
    case "any":
      return "any";
    case "literal":
      return JSON.stringify(v.value);
    case "id":
      return `Id<${v.tableName}>`;
    case "array":
      return `${validatorToString(v.value)}[]`;
    case "record":
      return `Record<${validatorToString(v.keys)}, ${validatorToString(v.values)}>`;
    case "union":
      return (Array.isArray(v.value) ? v.value : [])
        .map(validatorToString)
        .join(" | ");
    case "object": {
      const fields = Object.entries(v.value ?? {}).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ([k, f]: [string, any]) =>
          `${k}${f.optional ? "?" : ""}: ${validatorToString(f.fieldType)}`,
      );
      return `{ ${fields.join("; ")} }`;
    }
    default:
      return v.type ?? "any";
  }
}

export interface ArgSpec {
  name: string;
  type: string;
  optional: boolean;
}

/** Flatten an object-args validator into a list of top-level argument specs. */
export function argSpecs(args: Validator | null): ArgSpec[] {
  if (!args || args.type !== "object" || !args.value) return [];
  return Object.entries(args.value).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ([name, f]: [string, any]) => ({
      name,
      type: validatorToString(f.fieldType),
      optional: Boolean(f.optional),
    }),
  );
}

/** One-line human summary of a function's signature. */
export function signature(fn: FnSpec): string {
  const args = argSpecs(fn.args)
    .map((a) => `${a.name}${a.optional ? "?" : ""}: ${a.type}`)
    .join(", ");
  return `${fn.path}(${args}) [${fn.type}]`;
}
