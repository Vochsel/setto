import { ReactNode } from "react";
import { withAuth, getWorkOS } from "@workos-inc/authkit-nextjs";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, type SidebarUser } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, organizationId } = await withAuth({ ensureSignedIn: true });

  let orgLabel = "Personal workspace";
  if (organizationId) {
    try {
      const org = await getWorkOS().organizations.getOrganization(organizationId);
      orgLabel = org?.name ?? "Shared workspace";
    } catch {
      orgLabel = "Shared workspace";
    }
  }

  const sidebarUser: SidebarUser = {
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
    email: user.email ?? undefined,
    avatarUrl: user.profilePictureUrl ?? undefined,
    orgLabel,
  };

  return (
    <SidebarProvider>
      <AppSidebar user={sidebarUser} />
      <SidebarInset className="min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}
