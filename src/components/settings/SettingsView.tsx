"use client";

// Settings: display name, app-level network stats, stored data, honest PWA notes.

import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/common/Logo";
import { useIdentityStore } from "@/store/identityStore";
import { useViewStore } from "@/store/viewStore";
import { useChatStore } from "@/store/chatStore";
import { usePlayerStore } from "@/store/playerStore";
import { formatBytes } from "@/services/movieHash";
import { toast } from "sonner";

export function SettingsView() {
  const displayName = useIdentityStore((s) => s.displayName);
  const setName = useIdentityStore((s) => s.setName);
  const navigate = useViewStore((s) => s.navigate);
  const recentRooms = useViewStore((s) => s.recentRooms);
  const clearRecent = useViewStore((s) => s.clearRecentRooms);
  const [nameDraft, setNameDraft] = useState(displayName);

  const save = () => {
    const clean = nameDraft.trim().slice(0, 32);
    if (!clean) return;
    setName(clean);
    toast.success("Display name updated");
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-12 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("home")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Logo size="sm" />
      </header>

      <h1 className="mt-8 text-2xl font-bold tracking-tight">Settings</h1>

      <Card className="mt-6 border-border/70 bg-card/50">
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <label htmlFor="settings-name" className="text-sm font-medium">
              Display name
            </label>
            <div className="flex gap-2">
              <Input
                id="settings-name"
                key={displayName}
                defaultValue={displayName}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={32}
                className="h-10 bg-secondary/60"
              />
              <Button onClick={save} variant="secondary" className="h-10">
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Guest mode — your identity lives only in this browser (a random ID plus this name). No accounts, no
              email.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Local data</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-border/70"
                onClick={() => {
                  clearRecent();
                  toast.success("Recent rooms cleared");
                }}
                disabled={recentRooms.length === 0}
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear recent rooms ({recentRooms.length})
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <p className="text-sm font-medium text-foreground">About network usage</p>
            <p>
              SyncCinema never uploads or streams your movie. The room meter shows application-level payload
              bytes (play/pause/seek commands, chat, presence). Actual total network traffic is slightly higher
              due to TCP/TLS and WebSocket framing overhead — typically a few percent more.
            </p>
            <p>
              As an installed app (PWA), browser file handles don&apos;t survive a page reload — re-select your
              movie file when you come back; verification takes a moment and playback resumes at the room&apos;s
              position.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
