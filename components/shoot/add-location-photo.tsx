"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { processImageForUpload } from "@/lib/image";
import type { ImageRef } from "@/lib/types";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * On-location photo capture for a shoot's location. Offers two affordances that
 * matter on a phone: "Take photo" opens the rear camera directly (via the
 * `capture` attribute), and "Upload" opens the OS picker / camera roll. New
 * frames are appended to the location's reference images.
 */
export function AddLocationPhoto({
  locationId,
}: {
  locationId: Id<"locations">;
}) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const addImages = useMutation(api.locations.addImages);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const added: ImageRef[] = [];
      for (const original of files) {
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
        added.push({ storageId, source: "upload" });
      }
      await addImages({ id: locationId, images: added });
      toast.success(
        added.length > 1 ? `Added ${added.length} photos` : "Photo added",
      );
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => cameraRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
        Take photo
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => libraryRef.current?.click()}
      >
        <ImagePlus className="h-4 w-4" /> Upload
      </Button>

      {/* `capture` hints the rear camera on mobile; ignored on desktop. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => upload(Array.from(e.target.files ?? []))}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => upload(Array.from(e.target.files ?? []))}
      />
    </div>
  );
}
