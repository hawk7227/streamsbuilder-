"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Icons } from './components/Icons';

interface Conversation {
  id: string;
  title: string;
  date: string;
  preview: string;
  updatedAt: Date;
}

interface ConversationsResponse {
  data: Array<Omit<Conversation, "updatedAt"> & { updatedAt: string }>;
}

function CopilotCardSkeleton() {
  return (
    <div className="flex flex-col h-48 p-5 bg-zinc-900/30 border border-zinc-800 rounded-2xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent animate-pulse" />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="w-8 h-8 rounded-lg bg-white/[0.06]" />
          <div className="h-3 w-14 rounded bg-white/[0.06]" />
        </div>
        <div className="h-5 w-2/3 rounded bg-white/[0.06] mb-3" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-white/[0.06]" />
          <div className="h-3 w-5/6 rounded bg-white/[0.06]" />
          <div className="h-3 w-4/6 rounded bg-white/[0.06]" />
        </div>
      </div>
    </div>
  );
}

export default function CopilotPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const { data: conversations = [], isLoading, isFetching } = useQuery<Conversation[]>({
    queryKey: ['copilot-chats'],
    queryFn: async () => {
      const res = await fetch('/api/copilot/chats');
      if (!res.ok) throw new Error('Failed to fetch');
      const { data } = (await res.json()) as ConversationsResponse;
      return data.map((c) => ({
        ...c,
        updatedAt: new Date(c.updatedAt)
      }));
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/copilot/chat/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['copilot-chats'] });
      const prev = queryClient.getQueryData<Conversation[]>(['copilot-chats']) ?? [];
      queryClient.setQueryData<Conversation[]>(['copilot-chats'], (old = []) => old.filter((c) => c.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['copilot-chats'], ctx.prev);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['copilot-chats'] });
    }
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await fetch(`/api/copilot/chat/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error('Failed to rename');
    },
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: ['copilot-chats'] });
      const prev = queryClient.getQueryData<Conversation[]>(['copilot-chats']) ?? [];
      queryClient.setQueryData<Conversation[]>(['copilot-chats'], (old = []) =>
        old.map((c) => (c.id === id ? { ...c, title, updatedAt: new Date() } : c)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['copilot-chats'], ctx.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['copilot-chats'] });
    }
  });

  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch('/api/copilot/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error('Failed to create conversation');
      return (await res.json()) as { data: { id: string; title: string } };
    },
    onMutate: async (title: string) => {
      await queryClient.cancelQueries({ queryKey: ['copilot-chats'] });
      const prev = queryClient.getQueryData<Conversation[]>(['copilot-chats']) ?? [];
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: Conversation = {
        id: tempId,
        title,
        date: new Date().toLocaleDateString(),
        preview: '',
        updatedAt: new Date(),
      };
      queryClient.setQueryData<Conversation[]>(['copilot-chats'], [optimistic, ...prev]);
      return { prev, tempId };
    },
    onError: (_err, _title, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['copilot-chats'], ctx.prev);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['copilot-chats'] });
      setShowCreateDialog(false);
      setDraftTitle('');
      router.push(`/dashboard/copilot/${result.data.id}`);
    }
  });

  const handleCreateNewChat = () => {
    setDraftTitle('');
    setShowCreateDialog(true);
  };

  const handleOpenChat = (id: string) => {
    router.push(`/dashboard/copilot/${id}`);
  };

  const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) return;
    
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const handleOpenNewTab = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      window.open(`/dashboard/copilot/${id}`, '_blank');
  };

  const handleRenameChat = async (e: React.MouseEvent, chat: Conversation) => {
      e.stopPropagation();
      setSelectedChat(chat);
      setDraftTitle(chat.title);
      setShowRenameDialog(true);
  };

  const submitCreate = async () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) return;

    try {
      await createMutation.mutateAsync(nextTitle);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const submitRename = async () => {
    const nextTitle = draftTitle.trim();
    if (!selectedChat || !nextTitle || nextTitle === selectedChat.title) {
      setShowRenameDialog(false);
      return;
    }

    try {
      await renameMutation.mutateAsync({ id: selectedChat.id, title: nextTitle });
      setShowRenameDialog(false);
      setSelectedChat(null);
      setDraftTitle('');
    } catch (error) {
      console.error('Failed to rename chat:', error);
    }
  };

  return (
    <div className="flex h-screen -m-6 lg:-m-8 overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {showCreateDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-zinc-100">Create conversation</h2>
            <p className="mt-2 text-sm text-zinc-400">Enter the conversation name. After submit, the conversation will be created and opened.</p>
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitCreate();
                }
              }}
              placeholder="Conversation name"
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setDraftTitle('');
                }}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitCreate()}
                disabled={!draftTitle.trim() || createMutation.isPending}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameDialog && selectedChat && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-zinc-100">Rename conversation</h2>
            <p className="mt-2 text-sm text-zinc-400">Update the name for this conversation.</p>
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitRename();
                }
              }}
              placeholder="Conversation name"
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRenameDialog(false);
                  setSelectedChat(null);
                  setDraftTitle('');
                }}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitRename()}
                disabled={!draftTitle.trim() || renameMutation.isPending}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {renameMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 h-14 flex-shrink-0">
           <div className="flex items-center gap-2">
             <div className="flex items-center gap-2">
               <h1 className="text-sm font-semibold text-zinc-200">
                  Copilot Chats
               </h1>
             </div>
           </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto p-8">
             <div className="max-w-7xl mx-auto">
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <button 
                    onClick={handleCreateNewChat}
                    className="group flex flex-col items-center justify-center h-48 rounded-2xl border-2 border-dashed border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-900/50 transition-all duration-200"
                  >
                     <div className="w-12 h-12 rounded-full bg-zinc-900 group-hover:bg-emerald-500/10 flex items-center justify-center mb-3 transition-colors">
                        <div className="text-zinc-400 group-hover:text-emerald-500 transition-colors">
                          {Icons.plus}
                        </div>
                     </div>
                     <span className="font-medium text-zinc-300 group-hover:text-emerald-400 transition-colors">New Chat</span>
                  </button>

                  {(isLoading || isFetching) ? (
                    Array.from({ length: 12 }).map((_, idx) => <CopilotCardSkeleton key={idx} />)
                  ) : (
                    conversations.map((chat: Conversation) => (
                      <div
                        key={chat.id}
                        role="button"
                        onClick={() => handleOpenChat(chat.id)}
                        className="group flex flex-col h-48 p-5 bg-zinc-900/30 border border-zinc-800 rounded-2xl hover:bg-zinc-900/80 hover:border-zinc-700 transition-all duration-200 text-left relative overflow-hidden cursor-pointer"
                      >
                       <div className="flex items-start justify-between mb-3 w-full">
                          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-zinc-100 transition-colors">
                             {Icons.messageSquare || Icons.messageCircle}
                          </div>
                          <span className="text-xs text-zinc-500">{chat.date}</span>
                       </div>
                       
                       <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                          <button
                             onClick={(e) => handleRenameChat(e, chat)}
                             className="p-1.5 bg-zinc-800 text-zinc-400 hover:text-blue-400 hover:bg-zinc-700 rounded-lg transition-colors"
                             title="Rename Chat"
                          >
                             {Icons.edit3 || 'Rename'}
                          </button>
                          <button
                             onClick={(e) => handleOpenNewTab(e, chat.id)}
                             className="p-1.5 bg-zinc-800 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-700 rounded-lg transition-colors"
                             title="Open in New Tab"
                          >
                             {Icons.externalLink}
                          </button>
                          <button
                             onClick={(e) => handleDeleteChat(e, chat.id)}
                             className="p-1.5 bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 rounded-lg transition-colors"
                             title="Delete Chat"
                          >
                             {Icons.trash}
                          </button>
                       </div>
                       
                       <h3 className="font-medium text-zinc-200 mb-2 line-clamp-1 group-hover:text-emerald-400 transition-colors">{chat.title}</h3>
                       <p className="text-sm text-zinc-500 line-clamp-3 leading-relaxed">
                         {chat.preview}
                       </p>
                       
                       <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))
                  )}
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
