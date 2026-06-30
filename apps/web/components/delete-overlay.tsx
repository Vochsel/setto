"use client";

import { Trash2 } from "lucide-react";
import { ConfirmDelete } from "@/components/confirm-delete";

export function DeleteOverlay({
  onConfirm,
  title,
  description,
}: {
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: string;
}) {
  return (
    <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
      <ConfirmDelete
        title={title}
        description={description}
        onConfirm={onConfirm}
        trigger={
          <button
            type="button"
            aria-label="Delete"
            className="rounded-md bg-black/60 p-1.5 text-white backdrop-blur transition-colors hover:bg-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        }
      />
    </div>
  );
}
