"use client";

import React from 'react';
import { useVoiceConversation } from './useVoiceConversation';

interface VoiceBarProps {
  onTranscript: (text: string) => void;
  speakText?: string;
}

export function VoiceBar({ onTranscript, speakText }: VoiceBarProps) {
  const voice = useVoiceConversation();

  return (
    <div className="grid gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        {!voice.isRecording ? (
          <button type="button" onClick={() => void voice.startRecording()} className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/80">Start mic</button>
        ) : (
          <button type="button" onClick={() => void voice.stopRecording().then((t) => t && onTranscript(t))} className="rounded-full bg-red-500 px-3 py-2 text-xs font-semibold text-white">Stop + transcribe</button>
        )}

        <button type="button" onClick={() => speakText && void voice.speak(speakText)} disabled={!speakText || voice.isSpeaking} className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 disabled:opacity-50">Speak reply</button>
        {voice.isSpeaking && <button type="button" onClick={voice.stopSpeaking} className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/80">Stop audio</button>}
      </div>

      {voice.isTranscribing && <div className="text-xs text-white/60">Transcribing…</div>}
      {voice.transcript && <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white/80">{voice.transcript}</div>}
      {voice.error && <div className="text-xs text-red-300">{voice.error}</div>}
    </div>
  );
}
