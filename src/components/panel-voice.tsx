"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Square, X } from "lucide-react";

import { sendChat } from "~/app/chat-actions";
import { useRecorder, useReplyPlayer, voiceForm } from "~/components/chat/use-recorder";
import { Button } from "~/components/ui/button";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Talk to the panel: tap, say it, tap again. It goes to the same agent and
 * the same conversation as the chat; the reply is read aloud, shows in one
 * line under the header, and the panel reloads with what changed.
 */
export function PanelVoice() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, refresh] = useTransition();
  const { play, unlock } = useReplyPlayer();

  const send = useCallback(
    async (audio: Blob) => {
      setBusy(true);
      setError(null);
      setReply(null);
      const res = await sendChat(voiceForm(audio)).catch(() => ({ success: false as const, error: "Sin conexión. Prueba otra vez." }));
      setBusy(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setReply(res.data.replies.map((r) => r.body).filter(Boolean).join(" "));
      if (res.data.audio) play(`data:audio/mpeg;base64,${res.data.audio}`);
      refresh(() => router.refresh());
    },
    [play, router],
  );
  const recorder = useRecorder(send);

  const talk = () => {
    unlock();
    if (recorder.recording) recorder.stop();
    else void recorder.start();
  };

  const note = error ?? recorder.error;
  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {recorder.recording ? (
          <Button size="pill" variant="ghost" onClick={recorder.cancel}>
            Cancelar
          </Button>
        ) : null}
        <Button
          size="pill"
          variant={recorder.recording ? "default" : "outline"}
          onClick={talk}
          disabled={busy}
          aria-label={recorder.recording ? "Parar y mandar" : "Hablar"}
        >
          {busy ? <Loader2 className="animate-spin" /> : recorder.recording ? <Square /> : <Mic />}
          {recorder.recording ? <span className="tabular-nums">{clock(recorder.seconds)}</span> : busy ? "Pensando" : "Hablar"}
        </Button>
      </div>
      {reply ?? note ? (
        <div className="order-last flex basis-full items-start gap-2 rounded-2xl bg-white px-4 py-3 text-sm shadow-md animate-fade-in motion-reduce:animate-none">
          <p className={note && !reply ? "flex-1 text-red-500" : "flex-1 text-gray-700"}>{reply ?? note}</p>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => {
              setReply(null);
              setError(null);
            }}
            className="-m-1 rounded-full p-1 text-gray-400 transition-colors hover:text-gray-900"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </>
  );
}
