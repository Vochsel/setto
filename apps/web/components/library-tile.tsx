import { ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function LibraryTile({
  imageUrl,
  icon: Icon,
  title,
  subtitle,
  footer,
  aspect = "square",
}: {
  imageUrl?: string;
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  aspect?: "square" | "portrait" | "video";
}) {
  const aspectClass =
    aspect === "portrait"
      ? "aspect-[3/4]"
      : aspect === "video"
        ? "aspect-video"
        : "aspect-square";
  return (
    <Card className="group-hover:border-primary/40 h-full gap-0 overflow-hidden p-0 transition-colors">
      <div
        className={cn(
          "bg-muted/50 relative w-full overflow-hidden",
          aspectClass,
        )}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="text-muted-foreground/40 flex h-full w-full items-center justify-center">
            <Icon className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-medium">{title}</h3>
        {subtitle ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
            {subtitle}
          </p>
        ) : null}
        {footer ? <div className="mt-2">{footer}</div> : null}
      </div>
    </Card>
  );
}
