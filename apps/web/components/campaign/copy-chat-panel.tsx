"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage,
  type ToolUIPart,
  type DynamicToolUIPart,
} from "ai";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Send,
  Square,
  Pin,
  PinOff,
  Trash2,
  Check,
  Search,
  PencilLine,
  Eraser,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TEXT_MODELS, DEFAULT_TEXT_MODEL_ID } from "@/convex/lib/textModels";
import type { Id } from "@/convex/_generated/dataModel";

export interface AdCopy {
  headline?: string;
  tagline?: string;
  body?: string;
  cta?: string;
}

interface Persona {
  id: string;
  name: string;
  descriptor?: string;
  motivation?: string;
  angle?: string;
}

interface Research {
  positioning?: string;
}

export function CopyChatPanel({
  campaignId,
  brief,
  copy,
  personas,
  research,
}: {
  campaignId: Id<"campaigns">;
  brief?: string;
  copy?: AdCopy;
  personas?: Persona[];
  research?: Research;
}) {
  const update = useMutation(api.campaigns.update);
  const setCopy = useMutation(api.campaigns.setCopy);

  // The persisted chat thread is the source of truth; gate the chat until it
  // loads so useChat seeds from it once.
  const thread = useQuery(api.copyChat.get, { campaignId });

  const [briefValue, setBriefValue] = useState(brief ?? "");
  const [headline, setHeadline] = useState(copy?.headline ?? "");
  const [tagline, setTagline] = useState(copy?.tagline ?? "");
  const [body, setBody] = useState(copy?.body ?? "");
  const [cta, setCta] = useState(copy?.cta ?? "");

  function saveCopy(next: AdCopy) {
    setCopy({
      id: campaignId,
      copy: {
        headline: next.headline?.trim() || undefined,
        tagline: next.tagline?.trim() || undefined,
        body: next.body?.trim() || undefined,
        cta: next.cta?.trim() || undefined,
      },
    }).catch(() => toast.error("Could not save copy"));
  }

  function applyToWorkingCopy(v: AdCopy, notify = true) {
    setHeadline(v.headline ?? "");
    setTagline(v.tagline ?? "");
    setBody(v.body ?? "");
    setCta(v.cta ?? "");
    saveCopy(v);
    if (notify) toast.success("Applied to copy");
  }

  return (
    <Card className="gap-4 p-4">
      <div>
        <h2 className="text-sm font-medium">Brief &amp; copy</h2>
        <p className="text-muted-foreground text-xs">
          Describe the campaign, then chat with the copywriter to research the
          audience and write options — or edit the copy yourself.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="brief">Brief</Label>
        <Textarea
          id="brief"
          value={briefValue}
          onChange={(e) => setBriefValue(e.target.value)}
          onBlur={() =>
            briefValue !== (brief ?? "") &&
            update({ id: campaignId, brief: briefValue.trim() || undefined })
          }
          placeholder="Product, audience, tone, goal…"
          className="min-h-[64px] text-sm"
        />
      </div>

      <Separator />

      {/* Copywriter chat */}
      {thread === undefined ? (
        <div className="text-muted-foreground flex items-center gap-2 p-4 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading conversation…
        </div>
      ) : (
        <CopyChat
          campaignId={campaignId}
          initialMessages={thread as UIMessage[]}
          personas={personas}
          positioning={research?.positioning}
        />
      )}

      <Separator />

      {/* Growing copy library */}
      <CopyLibrary campaignId={campaignId} onApply={applyToWorkingCopy} />

      <Separator />

      {/* Working copy fields */}
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            onBlur={() => saveCopy({ headline, tagline, body, cta })}
            placeholder="Big, attention-grabbing line"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            onBlur={() => saveCopy({ headline, tagline, body, cta })}
            placeholder="Supporting line"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="body">Body</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => saveCopy({ headline, tagline, body, cta })}
            placeholder="1–2 sentences of detail"
            className="min-h-[52px] text-sm"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cta">Call to action</Label>
          <Input
            id="cta"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            onBlur={() => saveCopy({ headline, tagline, body, cta })}
            placeholder="Shop now"
          />
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────────── Chat ───────────────────────────── */

function CopyChat({
  campaignId,
  initialMessages,
  personas,
  positioning,
}: {
  campaignId: Id<"campaigns">;
  initialMessages: UIMessage[];
  personas?: Persona[];
  positioning?: string;
}) {
  const clearChat = useMutation(api.copyChat.clear);
  const [input, setInput] = useState("");
  const [modelKey, setModelKey] = useState(DEFAULT_TEXT_MODEL_ID);
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/campaigns/${campaignId}/copy-chat`,
        // Send only the new message (the server loads the rest from Convex)
        // plus the model picked at send time (passed as request-level body).
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            message: messages[messages.length - 1],
            modelKey: body?.modelKey,
          },
        }),
      }),
    [campaignId],
  );

  // Freeze the seed at mount: the thread query is reactive, but useChat owns the
  // live state — we don't want a later push to clobber an in-flight conversation.
  const [seed] = useState(initialMessages);
  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    id: campaignId,
    messages: seed,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text }, { body: { modelKey } });
    setInput("");
    // Scroll to the bottom on the next paint.
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
    );
  }

  const empty = messages.length === 0;
  const personaHint = (personas ?? []).map((p) => p.name).filter(Boolean);

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5" /> Copywriter
        </span>
        {!empty && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-6 px-1.5 text-[11px]"
            onClick={() => {
              clearChat({ campaignId }).catch(() => {});
              setMessages([]);
            }}
            disabled={busy}
          >
            <Eraser className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="max-h-[340px] min-h-[96px] space-y-3 overflow-y-auto pr-1"
      >
        {empty ? (
          <div className="text-muted-foreground space-y-2 py-2 text-xs">
            <p>
              Ask me to research the audience or write some copy. For example:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Research the audience",
                "Write 3 punchy options",
                positioning ? "Rewrite, more playful" : "Write copy from the brief",
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="bg-background hover:border-primary rounded border px-2 py-1 text-[11px]"
                >
                  {s}
                </button>
              ))}
            </div>
            {personaHint.length > 0 && (
              <p className="text-[11px]">
                Known personas: {personaHint.join(", ")}
              </p>
            )}
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}

        {status === "submitted" && (
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
        {error && (
          <p className="text-destructive text-xs">
            Something went wrong. Try again.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select value={modelKey} onValueChange={setModelKey}>
          <SelectTrigger size="sm" className="h-8 w-[120px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message the copywriter…"
          className="h-8 flex-1 text-sm"
        />
        {busy ? (
          <Button size="sm" variant="outline" onClick={() => stop()}>
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" onClick={submit} disabled={!input.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("");
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return part.text ? (
            <p
              key={i}
              className="text-foreground text-xs leading-relaxed whitespace-pre-wrap"
            >
              {part.text}
            </p>
          ) : null;
        }
        if (isToolUIPart(part)) {
          return <ToolStatus key={i} part={part} />;
        }
        return null;
      })}
    </div>
  );
}

/** A compact status chip for a tool call (research / write / apply). */
function ToolStatus({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const name = getToolName(part);
  const running =
    part.state === "input-streaming" || part.state === "input-available";
  const output = part.state === "output-available" ? part.output : undefined;
  // Tool executes return { error } on failure instead of throwing.
  const errored =
    part.state === "output-error" ||
    (output != null &&
      typeof output === "object" &&
      "error" in (output as Record<string, unknown>));

  const meta: Record<string, { running: string; done: string; Icon: typeof Search }> = {
    researchAudience: {
      running: "Researching the audience…",
      done: "Researched the audience",
      Icon: Search,
    },
    writeCopy: {
      running: "Writing copy…",
      done: "Wrote new options",
      Icon: Sparkles,
    },
    setWorkingCopy: {
      running: "Applying copy…",
      done: "Updated the working copy",
      Icon: PencilLine,
    },
  };
  const m = meta[name] ?? {
    running: "Working…",
    done: "Done",
    Icon: Sparkles,
  };
  const Icon = m.Icon;

  let label = running ? m.running : m.done;
  if (name === "writeCopy" && output && typeof output === "object") {
    const written = (output as { written?: number }).written;
    if (typeof written === "number")
      label = `Wrote ${written} option${written === 1 ? "" : "s"} → see library`;
  }
  if (errored) {
    const errText =
      part.state === "output-error"
        ? part.errorText
        : (output as { error?: string })?.error;
    label = errText || "Something went wrong";
  }

  return (
    <div
      className={cn(
        "text-muted-foreground flex items-center gap-1.5 text-[11px]",
        errored && "text-destructive",
      )}
    >
      {running ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {label}
    </div>
  );
}

/* ───────────────────────────── Library ───────────────────────────── */

function CopyLibrary({
  campaignId,
  onApply,
}: {
  campaignId: Id<"campaigns">;
  onApply: (v: AdCopy) => void;
}) {
  const variants = useQuery(api.copyVariants.list, { campaignId });
  const togglePin = useMutation(api.copyVariants.togglePin);
  const remove = useMutation(api.copyVariants.remove);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Copy library</span>
        {variants && variants.length > 0 && (
          <span className="text-muted-foreground text-[11px]">
            {variants.length} saved
          </span>
        )}
      </div>

      {variants === undefined ? (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : variants.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No options yet — ask the copywriter to write some. They&apos;ll
          accumulate here so you can compare and pick.
        </p>
      ) : (
        <div className="space-y-2">
          {variants.map((v) => (
            <div
              key={v._id}
              className="group bg-background hover:border-primary/60 rounded-md border p-2.5 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {(v.personaName || v.angle) && (
                    <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">
                      {[v.personaName, v.angle].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {v.headline && (
                    <p className="text-sm font-medium">{v.headline}</p>
                  )}
                  {v.tagline && (
                    <p className="text-muted-foreground text-xs">{v.tagline}</p>
                  )}
                  {v.body && (
                    <p className="text-muted-foreground mt-1 line-clamp-3 text-xs">
                      {v.body}
                    </p>
                  )}
                  {v.cta && (
                    <span className="bg-primary/10 text-primary mt-1.5 inline-block rounded px-1.5 py-0.5 text-[11px]">
                      {v.cta}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    title={v.pinned ? "Unpin" : "Pin"}
                    onClick={() => togglePin({ id: v._id }).catch(() => {})}
                    className={cn(
                      "text-muted-foreground hover:text-foreground rounded p-1",
                      v.pinned && "text-primary",
                    )}
                  >
                    {v.pinned ? (
                      <Pin className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <PinOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => remove({ id: v._id }).catch(() => {})}
                    className="text-muted-foreground hover:text-destructive rounded p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 w-full text-xs"
                onClick={() =>
                  onApply({
                    headline: v.headline,
                    tagline: v.tagline,
                    body: v.body,
                    cta: v.cta,
                  })
                }
              >
                <Check className="h-3.5 w-3.5" /> Use this copy
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
