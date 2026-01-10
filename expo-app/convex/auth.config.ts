import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Set this on the Convex dashboard per deployment.
      // Value should match the Issuer URL for Clerk's JWT template named "convex".
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
