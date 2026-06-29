"use client";

import { ReactNode, useState } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/image-uploader";
import {
  IMAGE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_LABEL,
  getImageModel,
  formatPrice,
  type ImageProvider,
} from "@/convex/lib/imageModels";
import { cleanImageRefs, withDisplayUrls, type ImageRef } from "@/lib/types";

interface ModelDoc {
  _id: string;
  name: string;
  promptDescriptor?: string;
  description?: string;
  attributes?: Record<string, string> | null;
  images?: ImageRef[];
  imageUrls?: { url: string }[];
}

/** A model holds at most two images: a headshot (thumbnail + face reference)
 * and a neutral model sheet. Split a model's stored images into those slots,
 * falling back for legacy models (first non-sheet image → headshot). */
function splitImages(model?: ModelDoc): {
  headshot: ImageRef | null;
  sheet: ImageRef | null;
} {
  const refs = withDisplayUrls(model?.images, model?.imageUrls);
  const sheet = refs.find((r) => r.source === "sheet") ?? null;
  const headshot =
    refs.find((r) => r.source === "headshot") ??
    refs.find((r) => r !== sheet) ??
    null;
  return { headshot, sheet };
}

const ATTR_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "age", label: "Age", placeholder: "late 20s" },
  { key: "build", label: "Build", placeholder: "tall, athletic" },
  { key: "hair", label: "Hair", placeholder: "dark wavy, shoulder-length" },
  { key: "features", label: "Features", placeholder: "freckles, green eyes" },
];

export function ModelEditor({
  trigger,
  model,
}: {
  trigger: ReactNode;
  model?: ModelDoc;
}) {
  const create = useMutation(api.models.create);
  const update = useMutation(api.models.update);
  const generateImage = useAction(api.generate.generateModelImage);
  const settings = useQuery(api.settings.get, {});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<null | "headshot" | "sheet">(
    null,
  );

  const [name, setName] = useState(model?.name ?? "");
  const [descriptor, setDescriptor] = useState(model?.promptDescriptor ?? "");
  const [description, setDescription] = useState(model?.description ?? "");
  const [attrs, setAttrs] = useState<Record<string, string>>(
    (model?.attributes as Record<string, string>) ?? {},
  );
  const [headshot, setHeadshot] = useState<ImageRef | null>(
    () => splitImages(model).headshot,
  );
  const [sheet, setSheet] = useState<ImageRef | null>(
    () => splitImages(model).sheet,
  );
  const [genModelKey, setGenModelKey] = useState<string | null>(null);
  const genDesired =
    genModelKey ?? settings?.defaultImageModelKey ?? DEFAULT_MODEL_ID;
  const genModel = getImageModel(genDesired) ? genDesired : DEFAULT_MODEL_ID;

  // Reset to a clean slate every time the sheet opens, so a reused "New model"
  // trigger never carries over values from a prior session.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(model?.name ?? "");
      setDescriptor(model?.promptDescriptor ?? "");
      setDescription(model?.description ?? "");
      setAttrs((model?.attributes as Record<string, string>) ?? {});
      const split = splitImages(model);
      setHeadshot(split.headshot);
      setSheet(split.sheet);
      setGenModelKey(null);
    }
    setOpen(next);
  }

  async function generate(kind: "headshot" | "sheet") {
    if (kind === "sheet" && !headshot?.url) {
      toast.error("Add or generate a headshot first");
      return;
    }
    setGenerating(kind);
    try {
      // The sheet is seeded from the headshot for identity; a headshot is
      // re-rendered from its own image when one exists, else from the text.
      const refs = headshot?.url ? [headshot.url] : undefined;
      const r = await generateImage({
        kind,
        prompt: descriptor.trim() || name.trim() || undefined,
        referenceImageUrls: refs,
        modelKey: genModel,
      });
      const ref: ImageRef = {
        storageId: r.storageId,
        url: r.url,
        source: kind,
      };
      if (kind === "sheet") setSheet(ref);
      else setHeadshot(ref);
      toast.success(
        kind === "sheet" ? "Model sheet generated" : "Headshot generated",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(null);
    }
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const cleanedAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([, v]) => v?.trim()),
    );
    // A model stores exactly its headshot + sheet (each tagged by source).
    const images: ImageRef[] = [];
    if (headshot) images.push({ ...headshot, source: "headshot" });
    if (sheet) images.push({ ...sheet, source: "sheet" });
    const payload = {
      name: name.trim(),
      promptDescriptor: descriptor.trim() || undefined,
      description: description.trim() || undefined,
      attributes: Object.keys(cleanedAttrs).length ? cleanedAttrs : undefined,
      images: cleanImageRefs(images),
    };
    try {
      if (model) await update({ id: model._id as never, ...payload });
      else await create(payload);
      toast.success(model ? "Model updated" : "Model created");
      setOpen(false);
    } catch {
      toast.error("Could not save model");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{model ? "Edit model" : "New model"}</SheetTitle>
          <SheetDescription>
            Reference images and a descriptor keep this person consistent across
            shots.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 p-4">
          <div className="grid gap-2">
            <Label htmlFor="m-name">Name</Label>
            <Input
              id="m-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mara"
            />
          </div>

          <div className="bg-muted/30 grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5" /> Generate with
              </Label>
              <Select value={genModel} onValueChange={(v) => setGenModelKey(v)}>
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["google", "openai", "fal"] as ImageProvider[]).map(
                    (prov) => (
                      <SelectGroup key={prov}>
                        <SelectLabel>{PROVIDER_LABEL[prov]}</SelectLabel>
                        {IMAGE_MODELS.filter((m) => m.provider === prov).map(
                          (m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="flex w-full items-center justify-between gap-3">
                                <span className="truncate">{m.label}</span>
                                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                                  ~{formatPrice(m.pricePerImage)}
                                </span>
                              </span>
                            </SelectItem>
                          ),
                        )}
                      </SelectGroup>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Headshot — the card thumbnail + face reference */}
              <div className="grid gap-2">
                <Label className="text-xs">Headshot</Label>
                <ImageUploader
                  max={1}
                  value={headshot ? [headshot] : []}
                  onChange={(refs) => setHeadshot(refs[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!!generating}
                  onClick={() => generate("headshot")}
                >
                  {generating === "headshot" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate headshot
                </Button>
              </div>

              {/* Model sheet — neutral face + angles + T-pose turnaround */}
              <div className="grid gap-2">
                <Label className="text-xs">Model sheet</Label>
                <ImageUploader
                  max={1}
                  value={sheet ? [sheet] : []}
                  onChange={(refs) => setSheet(refs[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!!generating || !headshot}
                  onClick={() => generate("sheet")}
                  title="Neutral model sheet generated from the headshot"
                >
                  {generating === "sheet" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Generate model sheet
                </Button>
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              Start with a headshot — generate one from the description below, or
              upload your own. Then generate the{" "}
              <span className="font-medium">model sheet</span> (a neutral face,
              angles &amp; T-pose turnaround) from it. Neutral clothing keeps a
              shot’s real wardrobe from bleeding in.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="m-desc">Prompt descriptor</Label>
            <Textarea
              id="m-desc"
              value={descriptor}
              onChange={(e) => setDescriptor(e.target.value)}
              placeholder="a 28-year-old woman with dark wavy hair and warm olive skin…"
            />
            <p className="text-muted-foreground text-xs">
              Injected directly into the generation prompt.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {ATTR_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-2">
                <Label htmlFor={`m-${f.key}`} className="text-xs">
                  {f.label}
                </Label>
                <Input
                  id={`m-${f.key}`}
                  value={attrs[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    setAttrs((a) => ({ ...a, [f.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="m-notes">Notes</Label>
            <Textarea
              id="m-notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal notes (not used in prompts)…"
            />
          </div>
        </div>

        <SheetFooter className="border-t">
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {model ? "Save changes" : "Create model"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
