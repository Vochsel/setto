"use client";

import { ReactNode, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, Tag, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

type Category = { _id: Id<"outfitCategories">; name: string; count: number };

export function ManageCategoriesDialog({ trigger }: { trigger: ReactNode }) {
  const categories = useQuery(api.outfitCategories.list, {});
  const create = useMutation(api.outfitCategories.create);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await create({ name: trimmed });
      setName("");
      toast.success("Category added");
    } catch {
      toast.error("Could not add category");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>
            Organise your wardrobe. Renaming a category updates it everywhere;
            deleting one leaves its items uncategorised.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category — e.g. Outerwear, Bags, Hats"
          />
          <Button type="submit" disabled={adding || !name.trim()}>
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </Button>
        </form>

        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
          {categories === undefined ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Loading…
            </p>
          ) : categories.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No categories yet"
              description="Add a few to group your wardrobe items."
            />
          ) : (
            categories.map((c) => <CategoryRow key={c._id} category={c} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const rename = useMutation(api.outfitCategories.rename);
  const remove = useMutation(api.outfitCategories.remove);
  const [value, setValue] = useState(category.name);

  async function commit() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === category.name) {
      setValue(category.name);
      return;
    }
    try {
      await rename({ id: category._id, name: trimmed });
      toast.success("Category renamed");
    } catch {
      setValue(category.name);
      toast.error("Could not rename");
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border p-1.5 pl-2">
      <Tag className="text-muted-foreground h-4 w-4 shrink-0" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-8 border-transparent bg-transparent px-1 shadow-none focus-visible:border-input"
      />
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {category.count} item{category.count === 1 ? "" : "s"}
      </span>
      <ConfirmDelete
        title={`Delete “${category.name}”?`}
        description="Items in this category will become uncategorised. This can't be undone."
        onConfirm={async () => {
          await remove({ id: category._id });
          toast.success("Category deleted");
        }}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-7 shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        }
      />
    </div>
  );
}
