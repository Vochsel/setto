import { cn } from "@/lib/utils";

/**
 * Brand marks for the integrations. Shopify and Buffer use their official
 * single-path logos (nominative use — they identify the service you connect to);
 * Printify has no published SVG mark, so we render a brand-green monogram.
 */
export type BrandProvider = "shopify" | "printify" | "buffer";

export const BRAND: Record<BrandProvider, { name: string; color: string }> = {
  shopify: { name: "Shopify", color: "#95BF47" },
  printify: { name: "Printify", color: "#1FA363" },
  buffer: { name: "Buffer", color: "#2C4BFF" },
};

const PATHS: Partial<Record<BrandProvider, string>> = {
  shopify:
    "M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z",
  buffer:
    "M1.371 5.476L11.943 0l10.686 5.476-10.686 5.495zm3.36 4.81l7.212 3.547 7.288-3.547 3.398 1.655-10.686 5.202L1.371 11.94zm0 6.171l7.212 3.911 7.288-3.91 3.398 1.815L11.943 24 1.371 18.273z",
};

/** The bare brand mark, inheriting `currentColor`. */
export function BrandIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const path = PATHS[provider as BrandProvider];
  if (path) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <path d={path} />
      </svg>
    );
  }
  // Printify monogram.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <text
        x="12"
        y="18"
        textAnchor="middle"
        fontSize="19"
        fontWeight="700"
        fill="currentColor"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        P
      </text>
    </svg>
  );
}

/** The brand mark on a tinted, rounded tile — legible in light and dark. */
export function BrandBadge({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const brand = BRAND[provider as BrandProvider];
  const color = brand?.color ?? "currentColor";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        className,
      )}
      style={{ backgroundColor: `${color}20`, color }}
      aria-hidden
    >
      <BrandIcon provider={provider} className="h-1/2 w-1/2" />
    </div>
  );
}
