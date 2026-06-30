import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StudioDemo } from "@/components/landing/studio-demo";
import {
  Camera,
  MapPin,
  Users,
  Shirt,
  Boxes,
  Sparkles,
  ArrowRight,
} from "lucide-react";

// ── Cinematic marketing track (DESIGN.md) ───────────────────────────────
// The landing page commits to the dark track: pure-black canvas, giant
// thin (≈330) display type, white type, and a single white-stroked black
// pill CTA per band. Aloe/pistachio greens stay off this surface — they
// belong to the transactional light track only.
//
// `button-outline-on-dark`: transparent on the black canvas, 2px white
// border, white label, pill geometry.
const PILL_OUTLINE_DARK =
  "h-11 rounded-full border-2 border-white bg-transparent px-6 text-[15px] text-white shadow-none hover:bg-white/10";

const features = [
  {
    icon: MapPin,
    title: "Real locations",
    body: "Pin places on a map and pull real Street View imagery to ground every backdrop in the actual world.",
  },
  {
    icon: Users,
    title: "Saved models",
    body: "Build a library of people with reference images and descriptors for consistent identity across shots.",
  },
  {
    icon: Shirt,
    title: "Wardrobe & variations",
    body: "Store clothing, hats, bags and accessories with colorways and styling variations, then batch-generate every option in one click.",
  },
  {
    icon: Boxes,
    title: "3D staging",
    body: "Optionally block out a scene in 3D — place the model, camera, lights and backdrop, then shoot through virtual cameras.",
  },
  {
    icon: Sparkles,
    title: "Model switcher",
    body: "Route the same prompt to Nano Banana, GPT Image, FLUX, Imagen and more through fal.",
  },
  {
    icon: Camera,
    title: "Presets",
    body: "Reusable photography styles, camera setups and lighting recipes folded automatically into the prompt.",
  },
];

const footerGroups = [
  {
    heading: "Product",
    links: ["Locations", "Models", "Wardrobe", "Presets"],
  },
  {
    heading: "Studio",
    links: ["Dashboard", "Shoots", "3D staging", "Gallery"],
  },
  {
    heading: "Company",
    links: ["About", "Pricing", "Contact", "Privacy"],
  },
];

export default async function LandingPage() {
  const { user } = await withAuth();
  if (user) redirect("/dashboard");

  return (
    <div className="font-inter ss03 flex min-h-screen flex-col bg-black text-white">
      {/* nav-bar-dark — wordmark left, two pill actions right. */}
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
            <Camera className="h-4.5 w-4.5" />
          </div>
          <span className="text-lg font-medium tracking-tight">Setto</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            asChild
            className="h-10 rounded-full px-5 text-[15px] text-white/80 hover:bg-white/10 hover:text-white"
            variant="ghost"
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className={PILL_OUTLINE_DARK + " h-10"} variant="outline">
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero — giant thin display set in clean negative space. */}
        <section className="mx-auto w-full max-w-7xl px-6 pt-24 pb-28 md:pt-36 md:pb-40">
          <p className="text-[12px] font-normal uppercase tracking-[0.72px] text-[#9dabad]">
            AI photo shoots, grounded in real places
          </p>
          <h1 className="mt-8 max-w-5xl text-[clamp(3.5rem,9vw,6rem)] font-light leading-[1.0] tracking-tight text-balance">
            Shoot anywhere.
            <br />
            <span className="text-[#a1a1aa]">Generate everything.</span>
          </h1>
          <p className="mt-9 max-w-xl text-lg font-medium leading-[1.56] text-[#a1a1aa]">
            Plan fashion shoots at real locations, stage them in 3D, and
            generate on-brand imagery with your whole team — from a single
            prompt pipeline.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Button asChild className={PILL_OUTLINE_DARK} variant="outline">
              <Link href="/signup">
                Start a shoot <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Link
              href="/login"
              className="text-[15px] text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Sign in
            </Link>
          </div>
        </section>

        {/* Interactive product demo — the real studio surface, clickable. */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-32">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[12px] font-normal uppercase tracking-[0.72px] text-[#9dabad]">
                Try the studio
              </p>
              <h2 className="mt-5 max-w-2xl text-[clamp(2rem,4.5vw,3rem)] font-light leading-[1.1] tracking-tight">
                Pick a look. Generate the shoot.
              </h2>
            </div>
            <p className="max-w-sm text-[15px] leading-[1.56] text-[#a1a1aa]">
              A live, clickable preview — choose a location, model and outfit,
              fan out one image per variation, then animate any frame into
              video.
            </p>
          </div>
          <div className="mt-10">
            <StudioDemo />
          </div>
        </section>

        {/* Feature band — card-feature-cinematic on elevated near-black. */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-32">
          <p className="text-[12px] font-normal uppercase tracking-[0.72px] text-[#9dabad]">
            The studio
          </p>
          <h2 className="mt-5 max-w-3xl text-[clamp(2.25rem,5vw,3.4rem)] font-light leading-[1.1] tracking-tight">
            Everything a shoot needs, in one pipeline.
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="highlight-inset rounded-xl border border-[#1e2c31] bg-[#0a0a0a] p-8 transition-colors hover:border-white/20"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-6 text-[20px] font-medium tracking-[0.3px]">
                  {f.title}
                </h3>
                <p className="mt-3 text-[16px] leading-[1.56] text-[#a1a1aa]">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA band — one action, giant type, full negative space. */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-32">
          <div className="border-t border-white/10 pt-24 text-center md:pt-32">
            <h2 className="mx-auto max-w-4xl text-[clamp(2.75rem,7vw,4.75rem)] font-light leading-[1.05] tracking-tight text-balance">
              Your next shoot starts here.
            </h2>
            <div className="mt-12 flex justify-center">
              <Button asChild className={PILL_OUTLINE_DARK} variant="outline">
                <Link href="/signup">
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* footer-dark — muted cool-tone link columns + legal row. */}
      <footer className="mx-auto w-full max-w-7xl px-6 py-16">
        <div className="flex flex-col gap-12 border-t border-white/10 pt-16 md:flex-row md:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
              <Camera className="h-4.5 w-4.5" />
            </div>
            <span className="text-lg font-medium tracking-tight">Setto</span>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {footerGroups.map((group) => (
              <div key={group.heading}>
                <p className="text-[12px] font-normal uppercase tracking-[0.72px] text-[#9797a2]">
                  {group.heading}
                </p>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link}>
                      <span className="cursor-default text-[14px] text-[#bdbdca] underline-offset-4 transition-colors hover:text-white">
                        {link}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-14 text-[13px] text-[#9797a2]">
          © {new Date().getFullYear()} Setto. AI photo shoots, grounded in real
          places.
        </p>
      </footer>
    </div>
  );
}
