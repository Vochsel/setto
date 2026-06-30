"use client";

import { useTheme } from "next-themes";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Sun, Moon, Monitor } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IMAGE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_LABEL,
  getImageModel,
  type ImageProvider,
} from "@/convex/lib/imageModels";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const settings = useQuery(api.settings.get, {});
  const setDefaultModel = useMutation(api.settings.setDefaultImageModel);

  const desiredKey = settings?.defaultImageModelKey ?? DEFAULT_MODEL_ID;
  const modelKey = getImageModel(desiredKey) ? desiredKey : DEFAULT_MODEL_ID;

  return (
    <>
      <PageHeader title="Settings" description="Preferences for this workspace" />

      <div className="mx-auto w-full max-w-2xl space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Choose how Setto looks. System follows your device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ToggleGroup
              type="single"
              variant="outline"
              value={theme ?? "system"}
              onValueChange={(v) => v && setTheme(v)}
            >
              {THEMES.map((t) => (
                <ToggleGroupItem
                  key={t.value}
                  value={t.value}
                  className="gap-1.5 px-4"
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Image generation</CardTitle>
            <CardDescription>
              Default model for new shots. Shared with your team; you can still
              switch per shot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={modelKey}
              onValueChange={(v) => {
                setDefaultModel({ modelKey: v }).catch(() => {});
              }}
            >
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["google", "openai", "fal"] as ImageProvider[]).map((prov) => (
                  <SelectGroup key={prov}>
                    <SelectLabel>{PROVIDER_LABEL[prov]}</SelectLabel>
                    {IMAGE_MODELS.filter((m) => m.provider === prov).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
