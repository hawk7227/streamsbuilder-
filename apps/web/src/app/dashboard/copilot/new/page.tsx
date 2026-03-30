"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatInterface from '../components/ChatInterface';
import PreviewPanel from '../components/PreviewPanel';
import { Icons } from '../components/Icons';

export default function CopilotNewChatPage() {
  const router = useRouter();
  const [conversationTitle, setConversationTitle] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [showTitleDialog, setShowTitleDialog] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCode, setPreviewCode] = useState('');
  const [previewLanguage, setPreviewLanguage] = useState('jsx');
  const [previewMode, setPreviewMode] = useState('preview');
  const hasPreview = previewCode.trim().length > 0;

  const handleSaveTitle = () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) return;
    setConversationTitle(nextTitle);
    setShowTitleDialog(false);
  };

  return (
    <div className="flex h-screen -m-6 lg:-m-8 overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {showTitleDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-zinc-100">Name your conversation</h2>
            <p className="mt-2 text-sm text-zinc-400">Choose a title before starting your new copilot conversation.</p>
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveTitle();
                }
              }}
              placeholder="Conversation name"
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => router.push('/dashboard/copilot')}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTitle}
                disabled={!draftTitle.trim()}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 h-14 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard/copilot')}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors mr-1"
              title="Back to Chats"
            >
              <div className="w-5 h-5 flex items-center justify-center rotate-180">
                {Icons.arrowRight || "<-"}
              </div>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                {Icons.sparkles}
              </div>
              <h1 className="text-sm font-semibold text-zinc-200">New Conversation</h1>
            </div>
          </div>

          <button
            onClick={() => hasPreview && setPreviewOpen(!previewOpen)}
            disabled={!hasPreview}
            className={`p-1.5 rounded-lg transition-colors ${previewOpen && hasPreview ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400`}
            title="Toggle Preview"
          >
            {Icons.panelRight}
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-0">
            <ChatInterface
              key="new"
              chatId={null}
              onChatCreated={(newId) => router.replace(`/dashboard/copilot/${newId}`)}
              previewOpen={previewOpen}
              setPreviewOpen={setPreviewOpen}
              setPreviewCode={setPreviewCode}
              setPreviewLanguage={setPreviewLanguage}
              conversationTitle={conversationTitle}
            />
          </div>

          {previewOpen && hasPreview && (
            <div className="w-[400px] xl:w-[450px] flex-shrink-0 border-l border-zinc-800 transition-all duration-300 hidden lg:block">
              <PreviewPanel
                isVisible={previewOpen}
                code={previewCode}
                language={previewLanguage}
                previewMode={previewMode}
                setPreviewMode={setPreviewMode}
                chatId={null}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
