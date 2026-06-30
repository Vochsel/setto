"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { processImageForUpload } from "@/lib/image";
import type { ImageRef } from "@/lib/types";

// Track mounted uploaders so a paste only lands in the most-recently-opened one
// (editors are modal, so the top of the stack is the one the user is looking at).
const uploaderStack: symbol[] = [];
const isTopUploader = (id: symbol) =>
  uploaderStack[uploaderStack.length - 1] === id;

export function ImageUploader({
  value,
  onChange,
  className,
  max = 12,
}: {
  value: ImageRef[];
  onChange: (refs: ImageRef[]) => void;
  className?: string;
  max?: number;
}) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Local previews for freshly-uploaded files (which only carry a storageId).
  const [previews, setPreviews] = useState<Record<string, string>>({});

  // Keep the latest value/handler available to the (stable) paste listener.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const room = max - valueRef.current.length;
      if (room <= 0) {
        toast.error(`Up to ${max} images`);
        return;
      }
      setUploading(true);
      try {
        const added: ImageRef[] = [];
        const newPreviews: Record<string, string> = {};
        for (const original of files.slice(0, room)) {
          const file = await processImageForUpload(original);
          const url = await generateUploadUrl();
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!res.ok) throw new Error("upload failed");
          const { storageId } = (await res.json()) as {
            storageId: ImageRef["storageId"];
          };
          if (storageId) {
            newPreviews[storageId] = URL.createObjectURL(file);
          }
          added.push({ storageId, source: "upload" });
        }
        setPreviews((p) => ({ ...p, ...newPreviews }));
        onChangeRef.current([...valueRef.current, ...added]);
      } catch {
        toast.error("Upload failed");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [generateUploadUrl, max],
  );

  // Register in the paste stack + listen for pasted images.
  useEffect(() => {
    const id = Symbol("uploader");
    uploaderStack.push(id);
    const onPaste = (e: ClipboardEvent) => {
      if (!isTopUploader(id)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const images: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) images.push(f);
        }
      }
      if (images.length) {
        e.preventDefault();
        void addFiles(images);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("paste", onPaste);
      const i = uploaderStack.indexOf(id);
      if (i !== -1) uploaderStack.splice(i, 1);
    };
  }, [addFiles]);

  const srcFor = (ref: ImageRef) =>
    ref.url ?? (ref.storageId ? previews[ref.storageId] : undefined);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {value.map((ref, i) => {
        const src = srcFor(ref);
        return (
          <div
            key={ref.storageId ?? ref.url ?? i}
            className="group border-border relative h-20 w-20 overflow-hidden rounded-lg border"
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={ref.caption ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="bg-muted h-full w-full" />
            )}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {value.length < max && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          title="Click to choose files, or paste an image"
          className="border-border text-muted-foreground hover:border-primary/50 hover:text-foreground flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs transition-colors"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
          {uploading ? "Uploading" : "Add / paste"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
      />
    </div>
  );
}
