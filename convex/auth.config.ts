// Convex validates WorkOS AuthKit access tokens (JWTs).
//
// Two important client ids:
//  - WORKOS_CLIENT_ID      — your application's client id (used by the SDK).
//  - WORKOS_JWT_CLIENT_ID  — the *environment's* client id that WorkOS uses in
//    the token `iss` (`https://api.workos.com/user_management/<this>`). It can
//    differ from the app client id; read it from a token's `iss` claim.
//
// Set both in the Convex deployment:
//   npx convex env set WORKOS_CLIENT_ID client_xxx
//   npx convex env set WORKOS_JWT_CLIENT_ID client_yyy
const clientId = process.env.WORKOS_CLIENT_ID;
const jwtClientId = process.env.WORKOS_JWT_CLIENT_ID ?? clientId;

export default {
  providers: [
    {
      type: "customJwt" as const,
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${jwtClientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt" as const,
      issuer: `https://api.workos.com/user_management/${jwtClientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${jwtClientId}`,
    },
  ],
};
