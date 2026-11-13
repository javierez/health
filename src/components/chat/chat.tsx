"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Camera, FileText, Mic, Square, X } from "lucide-react";

import { sendChat } from "~/app/chat-actions";
import { typingMs } from "~/lib/bubbles";
import { cn } from "~/lib/utils";
import type { ChatLine } from "~/server/queries/chat";
import { Bubble, Typing } from "./bubble";
import { resizePhoto, useRecorder, useReplyPlayer, voiceForm } from "./use-recorder";

/**
 * The home page: one conversation with the agent, the same one as on
 * WhatsApp. Typing, talking (tap the microphone, tap again to send), photos
 * (picked, pasted or dropped, several at once) or a PDF. The reply comes in a few short messages, one after another with
 * "escribiendo…" between; when he talked, it is also read aloud.
 */
const CHIPS = ["¿Qué me toca hoy?", "¿Cómo voy esta semana?", "Recuérdame a las 22:00 la pastilla", "¿Cuánto he dormido?"];

interface Sent {
  text: string;
  audio?: Blob;
  photos?: { blob: Blob; url: string }[];
  pdf?: File;
}

/** Like a WhatsApp album. */
const MAX_PHOTOS = 6;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function Chat({ initial }: { initial: ChatLine[] }) {
  const [lines, setLines] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [voices, setVoices] = useState<Record<number, string>>({});
  const list = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const tempId = useRef(-1);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines, pending]);

  const { play, unlock } = useReplyPlayer();

  const send = useCallback(
    async ({ text: body, audio, photos: images = [], pdf: doc }: Sent) => {
      if (pending) return;
      const id = tempId.current--;
      const mine: ChatLine = {
        id,
        day: "Hoy",
        clock: "",
        mine: true,
        attachment: audio ? "Nota de voz" : doc ? "PDF" : null,
        photos: images.map((p) => p.url),
        body: body || null,
        actions: [],
        failed: false,
      };
      setLines((l) => [...l, mine]);
      setPending(true);
      setError(null);

      const form = audio ? voiceForm(audio) : new FormData();
      if (body) form.append("text", body);
      for (const [i, p] of images.entries()) form.append("photo", p.blob, `foto-${i + 1}.jpg`);
      if (doc) form.append("pdf", doc, doc.name);
      const res = await sendChat(form).catch(() => ({ success: false as const, error: "Sin conexión. Prueba otra vez." }));
      if (!res.success) {
        setPending(false);
        setLines((l) => l.map((x) => (x.id === id ? { ...x, failed: true } : x)));
        setError(res.error);
        return;
      }
      setLines((l) => [...l.filter((x) => x.id !== id), res.data.mine]);
      const last = res.data.replies.at(-1);
      if (res.data.audio && last) {
        const src = `data:audio/mpeg;base64,${res.data.audio}`;
        setVoices((v) => ({ ...v, [last.id]: src }));
        play(src);
      }
      // One by one, "escribiendo…" in between: a conversation, not a page.
      for (const [i, r] of res.data.replies.entries()) {
        if (i > 0) await wait(typingMs(r.body ?? ""));
        setLines((l) => [...l, r]);
      }
      setPending(false);
    },
    [pending, play],
  );

  const recorder = useRecorder(useCallback((audio: Blob) => void send({ text: "", audio }), [send]));

  // The previews stay as the sent bubble's photos until the server's replace them.
  const submit = () => {
    const body = text.trim();
    if (!body && photos.length === 0 && !pdf) return;
    unlock();
    void send({ text: body, photos, pdf: pdf ?? undefined });
    setText("");
    setPhotos([]);
    setPdf(null);
  };

  const talk = () => {
    unlock();
    if (recorder.recording) recorder.stop();
    else void recorder.start();
  };

  /** From the picker, a paste or a drop: photos are made small here, a PDF goes as it is. */
  const pick = async (files: File[]) => {
    const doc = files.find((f) => f.type === "application/pdf");
    if (doc) setPdf(doc);
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, MAX_PHOTOS - photos.length);
    try {
      const blobs = await Promise.all(images.map((f) => resizePhoto(f)));
      setPhotos((ps) => [...ps, ...blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))].slice(0, MAX_PHOTOS));
    } catch {
      setError("No se pudo leer la foto. Si es HEIC, mándala por WhatsApp.");
    }
  };

  const shownError = error ?? recorder.error;
  const canSend = (text.trim().length > 0 || photos.length > 0 || pdf) && !recorder.recording;

  return (
    <>
      <div ref={list} role="log" aria-live="polite" className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
          {lines.length === 0 && !pending ? (
            <Empty onTalk={talk} onChip={(c) => void send({ text: c })} />
          ) : null}
          {lines.map((line, i) => (
            <Bubble
              key={line.id}
              line={line}
              prev={lines[i - 1]}
              // While it types, its last message already belongs to the next one.
              next={lines[i + 1] ?? (pending && !line.mine ? line : undefined)}
              fresh={i >= initial.length}
              voice={voices[line.id]}
              onPlay={play}
            />
          ))}
          {pending ? <Typing /> : null}
          {shownError ? <p className="mb-3 text-right text-xs text-red-500">{shownError}</p> : null}
        </div>
      </div>

      <div className="bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick([...e.dataTransfer.files]);
          }}
          className="mx-auto max-w-2xl px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6"
        >
          {photos.length > 0 || pdf ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {photos.map((p) => (
                <div key={p.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob, not a page image */}
                  <img src={p.url} alt="Foto para mandar" className="h-16 w-16 rounded-xl object-cover" />
                  <Remove
                    label="Quitar la foto"
                    onClick={() => {
                      URL.revokeObjectURL(p.url);
                      setPhotos((ps) => ps.filter((x) => x.url !== p.url));
                    }}
                  />
                </div>
              ))}
              {pdf ? (
                <div className="relative flex h-16 max-w-48 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-700">
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{pdf.name}</span>
                  <Remove label="Quitar el PDF" onClick={() => setPdf(null)} />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <div
              className={cn(
                "flex min-h-11 flex-1 items-center gap-1 rounded-3xl border border-gray-200 bg-gray-50 pl-4 pr-1 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-300",
                recorder.recording && "bg-white ring-2 ring-amber-300",
              )}
            >
              {recorder.recording ? (
                <span className="flex flex-1 items-center gap-2 py-2.5 text-[15px] text-gray-700 sm:text-sm">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                  <span className="tabular-nums">{clock(recorder.seconds)}</span>
                  <button type="button" onClick={recorder.cancel} className="ml-auto px-3 text-xs text-gray-500 hover:text-gray-900">
                    Cancelar
                  </button>
                </span>
              ) : (
                <>
                  <textarea
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onPaste={(e) => {
                      const files = [...e.clipboardData.files];
                      if (files.length === 0) return;
                      e.preventDefault();
                      void pick(files);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    placeholder="Escribe o toca el micro"
                    className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-base outline-none [field-sizing:content] placeholder:text-gray-400 sm:text-sm"
                  />
                  <button
                    type="button"
                    aria-label="Mandar fotos o un PDF"
                    onClick={() => picker.current?.click()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                  <input
                    ref={picker}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void pick([...(e.target.files ?? [])]);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </div>
            {canSend ? (
              <button
                type="submit"
                aria-label="Mandar"
                disabled={pending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-sm transition-colors hover:bg-gray-800 active:scale-95 disabled:opacity-40"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                aria-label={recorder.recording ? "Parar y mandar" : "Hablar"}
                onClick={talk}
                disabled={pending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-sm transition-colors hover:bg-gray-800 active:scale-95 disabled:opacity-40"
              >
                {recorder.recording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function Empty({ onTalk, onChip }: { onTalk: () => void; onChip: (text: string) => void }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 px-2 text-center">
      <button
        type="button"
        onClick={onTalk}
        aria-label="Hablar"
        className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gray-900 text-white shadow-xl transition-transform active:scale-95"
      >
        <span className="absolute -inset-2 animate-pulse rounded-full bg-gray-900/10" />
        <Mic className="relative h-8 w-8" />
      </button>
      <p className="text-base text-gray-500 sm:text-sm">Toca para hablar, o pídeme algo</p>
      <div className="flex flex-wrap justify-center gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChip(c)}
            className="rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-500 transition-colors hover:bg-gray-50 sm:px-3 sm:py-1.5 sm:text-xs"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
