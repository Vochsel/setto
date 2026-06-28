/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as files from "../files.js";
import type * as generate from "../generate.js";
import type * as generations from "../generations.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_imageModels from "../lib/imageModels.js";
import type * as lib_prompt from "../lib/prompt.js";
import type * as locations from "../locations.js";
import type * as models from "../models.js";
import type * as outfits from "../outfits.js";
import type * as presets from "../presets.js";
import type * as settings from "../settings.js";
import type * as shootLocations from "../shootLocations.js";
import type * as shoots from "../shoots.js";
import type * as shots from "../shots.js";
import type * as streetview from "../streetview.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  files: typeof files;
  generate: typeof generate;
  generations: typeof generations;
  "lib/auth": typeof lib_auth;
  "lib/imageModels": typeof lib_imageModels;
  "lib/prompt": typeof lib_prompt;
  locations: typeof locations;
  models: typeof models;
  outfits: typeof outfits;
  presets: typeof presets;
  settings: typeof settings;
  shootLocations: typeof shootLocations;
  shoots: typeof shoots;
  shots: typeof shots;
  streetview: typeof streetview;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
