"use client";

import { ReactNode, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { Loader2, Plus, X } from "lucide-react";
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
import { Combobox } from "@/components/ui/combobox";
import { ImageUploader } from "@/components/image-uploader";
import {
  cleanImageRefs,
  withDisplayUrls,
  type ImageRef,
  type OutfitVariation,
} from "@/lib/types";
import type { Id } from "@/convex/_generated/dataModel";

interface OutfitDoc {
  _id: string;
  name: string;
  categoryId?: Id<"outfitCategories">;
  categoryName?: string;
  promptDescriptor?: string;
  images?: ImageRef[];
  imageUrls?: { url: string }[];
  variations?: OutfitVariation[];
}

/** Seed editor variations with display URLs so existing images render. */
function seedVariations(variations?: OutfitVariation[]): OutfitVariation[] {
  return (variations ?? []).map((v) => ({
    ...v,
    images: withDisplayUrls(v.images, v.imageUrls),
  }));
}

export function OutfitEditor({
  trigger,
  outfit,
}: {
  trigger: ReactNode;
  outfit?: OutfitDoc;
}) {
  const create = useMutation(api.outfits.create);
  const update = useMutation(api.outfits.update);
  const categories = useQuery(api.outfitCategories.list, {});
  const createCategory = useMutation(api.outfitCategories.create);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(outfit?.name ?? "");
  const [categoryId, setCategoryId] = useState<
    Id<"outfitCategories"> | undefined
  >(outfit?.categoryId);
  const [descriptor, setDescriptor] = useState(outfit?.promptDescriptor ?? "");
  const [images, setImages] = useState<ImageRef[]>(
    withDisplayUrls(outfit?.images, outfit?.imageUrls),
  );
  const [variations, setVariations] = useState<OutfitVariation[]>(
    seedVariations(outfit?.variations),
  );

  // Reset the form whenever the sheet opens, so a reused trigger (e.g. the
  // single "New item" button) never shows stale values from a prior create.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(outfit?.name ?? "");
      setCategoryId(outfit?.categoryId);
      setDescriptor(outfit?.promptDescriptor ?? "");
      setImages(withDisplayUrls(outfit?.images, outfit?.imageUrls));
      setVariations(seedVariations(outfit?.variations));
    }
    setOpen(next);
  }

  async function pickNewCategory(catName: string) {
    try {
      const id = await createCategory({ name: catName });
      setCategoryId(id);
    } catch {
      toast.error("Could not create category");
    }
  }

  function addVariation() {
    setVariations((v) => [
      ...v,
      { id: nanoid(8), name: "", promptDescriptor: "", images: [] },
    ]);
  }
  function patchVariation(id: string, patch: Partial<OutfitVariation>) {
    setVariations((v) => v.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      promptDescriptor: descriptor.trim() || undefined,
      images: cleanImageRefs(images),
      variations: variations
        .filter((v) => v.name.trim())
        .map((v) => ({
          id: v.id,
          name: v.name.trim(),
          promptDescriptor: v.promptDescriptor?.trim() || undefined,
          images: cleanImageRefs(v.images ?? []),
        })),
    };
    try {
      if (outfit)
        await update({
          id: outfit._id as never,
          ...payload,
          categoryId: categoryId ?? null,
        });
      else await create({ ...payload, categoryId });
      toast.success(outfit ? "Item updated" : "Item created");
      setOpen(false);
    } catch {
      toast.error("Could not save item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>
            {outfit ? "Edit wardrobe item" : "New wardrobe item"}
          </SheetTitle>
          <SheetDescription>
            Add variations (colorways, stylings) to batch-generate every option
            from a single shot.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="o-name">Name</Label>
              <Input
                id="o-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Linen trench coat"
              />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Combobox
                value={categoryId}
                onChange={(v) =>
                  setCategoryId(v as Id<"outfitCategories"> | undefined)
                }
                options={(categories ?? []).map((c) => ({
                  value: c._id,
                  label: c.name,
                }))}
                placeholder="Uncategorised"
                searchPlaceholder="Find or create…"
                emptyText="No categories yet."
                onCreate={pickNewCategory}
                createLabel="Create category"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Reference images</Label>
            <ImageUploader value={images} onChange={setImages} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="o-desc">Prompt descriptor</Label>
            <Textarea
              id="o-desc"
              value={descriptor}
              onChange={(e) => setDescriptor(e.target.value)}
              placeholder="an oversized beige linen trench coat, belted, mid-length…"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Variations</Label>
              <Button variant="outline" size="sm" onClick={addVariation}>
                <Plus className="h-3.5 w-3.5" /> Add variation
              </Button>
            </div>
            {variations.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
                No variations. The base outfit will be used as-is.
              </p>
            ) : (
              <div className="space-y-3">
                {variations.map((v) => (
                  <div
                    key={v.id}
                    className="border-border bg-muted/30 relative space-y-2 rounded-lg border p-3"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setVariations((arr) => arr.filter((x) => x.id !== v.id))
                      }
                      className="text-muted-foreground hover:text-destructive absolute right-2 top-2"
                      aria-label="Remove variation"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <Input
                      value={v.name}
                      onChange={(e) =>
                        patchVariation(v.id, { name: e.target.value })
                      }
                      placeholder="Variation name (e.g. Camel)"
                      className="pr-8"
                    />
                    <Textarea
                      value={v.promptDescriptor ?? ""}
                      onChange={(e) =>
                        patchVariation(v.id, { promptDescriptor: e.target.value })
                      }
                      placeholder="in a deep camel colour, suede texture…"
                      className="min-h-[60px]"
                    />
                    <ImageUploader
                      max={4}
                      value={v.images ?? []}
                      onChange={(imgs) => patchVariation(v.id, { images: imgs })}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="border-t">
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {outfit ? "Save changes" : "Create item"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
