/**
 * Deploy the Remotion render Lambda + site bundle, then print the values to set
 * as Convex env vars (the render action reads these).
 *
 * Prereqs: AWS credentials with the Remotion Lambda permissions in the
 * environment (REMOTION_AWS_ACCESS_KEY_ID / REMOTION_AWS_SECRET_ACCESS_KEY, or a
 * normal AWS profile). See https://remotion.dev/docs/lambda/setup.
 *
 *   pnpm --filter @setto/remotion deploy
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deployFunction,
  deploySite,
  getOrCreateBucket,
} from "@remotion/lambda";

const REGION = (process.env.REMOTION_REGION ?? "us-east-1") as Parameters<
  typeof deployFunction
>[0]["region"];

const here = path.dirname(fileURLToPath(import.meta.url));
const entryPoint = path.join(here, "..", "src", "index.ts");

async function main() {
  console.log(`▶ Deploying Remotion Lambda in ${REGION}…`);

  const { functionName } = await deployFunction({
    region: REGION,
    timeoutInSeconds: 240,
    memorySizeInMb: 3009,
    diskSizeInMb: 10240,
    createCloudWatchLogGroup: true,
  });
  console.log(`✔ Function: ${functionName}`);

  const { bucketName } = await getOrCreateBucket({ region: REGION });
  console.log(`✔ Bucket: ${bucketName}`);

  const { serveUrl } = await deploySite({
    entryPoint,
    bucketName,
    region: REGION,
    siteName: "setto-timeline",
  });
  console.log(`✔ Serve URL: ${serveUrl}`);

  console.log(`\nSet these on your Convex deployment:\n`);
  console.log(`  npx convex env set REMOTION_REGION ${REGION}`);
  console.log(`  npx convex env set REMOTION_LAMBDA_FUNCTION_NAME ${functionName}`);
  console.log(`  npx convex env set REMOTION_SERVE_URL ${serveUrl}`);
  console.log(
    `  npx convex env set REMOTION_AWS_ACCESS_KEY_ID <your-key>\n` +
      `  npx convex env set REMOTION_AWS_SECRET_ACCESS_KEY <your-secret>\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
