/**
 * Convert a Convex validator (as emitted by `convex function-spec`) into a
 * JSON Schema, so each function becomes a properly-typed MCP tool input.
 *
 * Shared by every MCP transport (the stdio server in apps/mcp and the remote
 * HTTP server in apps/web) so the tool schemas are identical everywhere.
 */
import type { Validator } from "./manifest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export function validatorToJsonSchema(v: Validator): Json {
  if (!v || typeof v !== "object") return {};
  switch (v.type) {
    case "null":
      return { type: "null" };
    case "number":
      return { type: "number" };
    case "bigint":
      return { type: "integer" };
    case "boolean":
      return { type: "boolean" };
    case "string":
      return { type: "string" };
    case "bytes":
      return { type: "string", contentEncoding: "base64" };
    case "any":
      return {};
    case "literal":
      return { const: v.value };
    case "id":
      return { type: "string", description: `Id<${v.tableName}>` };
    case "array":
      return { type: "array", items: validatorToJsonSchema(v.value) };
    case "record":
      return {
        type: "object",
        additionalProperties: validatorToJsonSchema(v.values),
      };
    case "union": {
      const opts: Json[] = Array.isArray(v.value) ? v.value : [];
      if (opts.length && opts.every((o) => o?.type === "literal"))
        return { enum: opts.map((o) => o.value) };
      return { anyOf: opts.map(validatorToJsonSchema) };
    }
    case "object": {
      const properties: Record<string, Json> = {};
      const required: string[] = [];
      for (const [k, f] of Object.entries(v.value ?? {})) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const field = f as any;
        properties[k] = validatorToJsonSchema(field.fieldType);
        if (!field.optional) required.push(k);
      }
      const schema: Json = { type: "object", properties };
      if (required.length) schema.required = required;
      return schema;
    }
    default:
      return {};
  }
}

/** Top-level args validator → an object JSON Schema (always object-typed). */
export function argsJsonSchema(args: Validator | null): Json {
  if (!args || args.type !== "object")
    return { type: "object", properties: {} };
  return validatorToJsonSchema(args);
}
