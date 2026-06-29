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
    <header className="bg-background/80 sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b px-3 backdrop-blur sm:gap-3 sm:px-4 md:px-6">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <Separator orientation="vertical" className="mr-0.5 h-5 shrink-0 sm:mr-1" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground truncate text-xs">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {children}
        </div>
      ) : null}
    </header>
  );
}
