import { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode; // right-aligned actions
}) {
  return (
    <header className="bg-background/80 sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground truncate text-xs">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex items-center gap-2">{children}</div>
      ) : null}
    </header>
  );
}
