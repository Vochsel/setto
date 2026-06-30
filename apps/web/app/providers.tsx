"use client";

import { ReactNode, useCallback, useEffect, useMemo } from "react";
import { ThemeProvider } from "next-themes";
import { ConvexReactClient, ConvexProviderWithAuth } from "convex/react";
import {
  AuthKitProvider,
  useAuth,
  useAccessToken,
} from "@workos-inc/authkit-nextjs/components";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/** Adapts WorkOS AuthKit into the shape ConvexProviderWithAuth expects. */
function useWorkOSAuthForConvex() {
  const { loading, user } = useAuth();
  const { getAccessToken } = useAccessToken();

  const fetchAccessToken = useCallback(
    async (_opts: { forceRefreshToken: boolean }) => {
      try {
        const token = await getAccessToken();
        return token ?? null;
      } catch {
        return null;
      }
    },
    [getAccessToken],
  );

  return useMemo(
    () => ({
      isLoading: loading,
      isAuthenticated: !!user,
      fetchAccessToken,
    }),
    [loading, user, fetchAccessToken],
  );
}

/** Mirrors the signed-in WorkOS user + active org into Convex. */
function SyncUser() {
  const { user, organizationId } = useAuth();
  const store = useMutation(api.users.store);
  useEffect(() => {
    if (!user) return;
    store({
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
      email: user.email ?? undefined,
      avatarUrl: user.profilePictureUrl ?? undefined,
      // org name isn't on the user object; cached lazily elsewhere.
      orgName: undefined,
    }).catch(() => {});
  }, [user, organizationId, store]);
  return null;
}

function MissingConvex() {
  return (
    <div className="bg-grid flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Convex isn’t configured yet</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Run <code className="bg-muted rounded px-1.5 py-0.5">npx convex dev</code>{" "}
        and copy the deployment URL into{" "}
        <code className="bg-muted rounded px-1.5 py-0.5">NEXT_PUBLIC_CONVEX_URL</code>{" "}
        in <code className="bg-muted rounded px-1.5 py-0.5">.env.local</code>.
      </p>
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AuthKitProvider>
        <TooltipProvider delayDuration={200}>
          {convex ? (
            <ConvexProviderWithAuth
              client={convex}
              useAuth={useWorkOSAuthForConvex}
            >
              <SyncUser />
              {children}
            </ConvexProviderWithAuth>
          ) : (
            <MissingConvex />
          )}
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </AuthKitProvider>
    </ThemeProvider>
  );
}
