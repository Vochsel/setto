import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Camera,
  MapPin,
  Users,
  Shirt,
  Boxes,
  Sparkles,
  ArrowRight,
} from "lucide-react";

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

export default async function LandingPage() {
  const { user } = await withAuth();
  if (user) redirect("/dashboard");

  return (
    <div className="bg-grid relative flex min-h-screen flex-col">
      <div className="bg-radial-glow pointer-events-none absolute inset-0" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg">
            <Camera className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Setto</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6">
        <section className="flex flex-col items-center pt-20 pb-16 text-center md:pt-28">
          <div className="border-border bg-card/60 text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> AI photo shoots, grounded in real
            places
          </div>
          <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight md:text-6xl">
            Shoot anywhere.
            <br />
            <span className="from-primary to-chart-4 bg-gradient-to-r bg-clip-text text-transparent">
              Generate everything.
            </span>
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-balance text-lg">
            Plan fashion shoots at real locations, stage them in 3D, and generate
            on-brand imagery with your whole team — from a single prompt pipeline.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">
                Start a shoot <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>

        <section className="grid w-full grid-cols-1 gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="border-border bg-card/60 hover:border-primary/40 group rounded-xl border p-5 backdrop-blur transition-colors"
            >
              <div className="bg-primary/10 text-primary mb-3 flex h-10 w-10 items-center justify-center rounded-lg">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-medium">{f.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
