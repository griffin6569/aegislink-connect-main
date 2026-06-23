import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CircleAlert, Loader2, LogIn, MessageSquareText, Send, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type DirectMessage = Tables<'client_messages'>;

interface MessagingClient {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
}

const THREAD_LIMIT = 300;

function getClientLabel(client: MessagingClient) {
  return client.display_name?.trim() || `Client ${client.user_id.slice(0, 8)}`;
}

function getClientInitials(client: MessagingClient) {
  const label = getClientLabel(client);
  const parts = label.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'CL';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function formatMessageTime(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function ClientMessagingPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clients, setClients] = useState<MessagingClient[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) {
      setClients([]);
      setMessages([]);
      setSelectedClientId('');
      setLoading(false);
      setRefreshError(null);
      return;
    }

    let active = true;

    const refreshData = async (showToastOnError: boolean) => {
      const [{ data: profileRows, error: profilesError }, { data: messageRows, error: messagesError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url, phone')
          .neq('user_id', user.id)
          .order('display_name', { ascending: true }),
        supabase
          .from('client_messages')
          .select('*')
          .or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(THREAD_LIMIT),
      ]);

      if (!active) {
        return;
      }

      if (profilesError || messagesError) {
        const message = profilesError?.message || messagesError?.message || 'Unable to load client messages';
        setRefreshError(message);
        setLoading(false);

        if (showToastOnError) {
          toast.error(message);
        }
        return;
      }

      setClients((profileRows as MessagingClient[] | null) ?? []);
      setMessages((messageRows as DirectMessage[] | null) ?? []);
      setRefreshError(null);
      setLoading(false);
    };

    setLoading(true);
    refreshData(true).catch((error: unknown) => {
      if (!active) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Unable to load client messages';
      setRefreshError(message);
      setLoading(false);
      toast.error(message);
    });

    const channel = supabase
      .channel(`client-messages-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_messages' }, (payload) => {
        const candidate = (payload.new && typeof payload.new === 'object'
          ? payload.new
          : payload.old && typeof payload.old === 'object'
            ? payload.old
            : null) as Partial<DirectMessage> | null;

        if (!candidate) {
          return;
        }

        if (candidate.sender_user_id !== user.id && candidate.recipient_user_id !== user.id) {
          return;
        }

        refreshData(false).catch((error: unknown) => {
          console.error('Realtime message refresh error:', error);
        });
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const threadSummaries = clients
    .map((client) => {
      const threadMessages = messages.filter((message) => (
        (message.sender_user_id === client.user_id && message.recipient_user_id === user?.id) ||
        (message.sender_user_id === user?.id && message.recipient_user_id === client.user_id)
      ));

      const latestMessage = threadMessages[0] ?? null;
      const unreadCount = messages.filter((message) => (
        message.sender_user_id === client.user_id &&
        message.recipient_user_id === user?.id &&
        !message.read_at
      )).length;

      return {
        client,
        latestMessage,
        unreadCount,
      };
    })
    .sort((left, right) => {
      if (right.unreadCount !== left.unreadCount) {
        return right.unreadCount - left.unreadCount;
      }

      if (left.latestMessage && right.latestMessage) {
        return new Date(right.latestMessage.created_at).getTime() - new Date(left.latestMessage.created_at).getTime();
      }

      if (right.latestMessage) {
        return 1;
      }

      if (left.latestMessage) {
        return -1;
      }

      return getClientLabel(left.client).localeCompare(getClientLabel(right.client));
    });

  const selectedClient = clients.find((client) => client.user_id === selectedClientId) ?? null;
  const conversationMessages = selectedClientId
    ? messages
        .filter((message) => (
          (message.sender_user_id === selectedClientId && message.recipient_user_id === user?.id) ||
          (message.sender_user_id === user?.id && message.recipient_user_id === selectedClientId)
        ))
        .slice()
        .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    : [];

  useEffect(() => {
    if (!clients.length) {
      if (selectedClientId) {
        setSelectedClientId('');
      }
      return;
    }

    if (selectedClientId && clients.some((client) => client.user_id === selectedClientId)) {
      return;
    }

    const preferredClientId = threadSummaries.find((thread) => thread.unreadCount > 0)?.client.user_id
      || threadSummaries.find((thread) => thread.latestMessage)?.client.user_id
      || clients[0]?.user_id
      || '';

    if (preferredClientId) {
      setSelectedClientId(preferredClientId);
    }
  }, [clients, selectedClientId, threadSummaries]);

  useEffect(() => {
    if (!user || !selectedClientId) {
      return;
    }

    const unreadIds = messages
      .filter((message) => (
        message.sender_user_id === selectedClientId &&
        message.recipient_user_id === user.id &&
        !message.read_at
      ))
      .map((message) => message.id);

    if (unreadIds.length === 0) {
      return;
    }

    const readAt = new Date().toISOString();
    let cancelled = false;

    const markRead = async () => {
      const { error } = await supabase
        .from('client_messages')
        .update({ read_at: readAt })
        .in('id', unreadIds);

      if (error) {
        console.error('Unable to mark messages as read:', error);
        return;
      }

      if (cancelled) {
        return;
      }

      setMessages((current) => current.map((message) => (
        unreadIds.includes(message.id)
          ? { ...message, read_at: readAt }
          : message
      )));
    };

    markRead().catch((error: unknown) => {
      console.error('Unable to mark messages as read:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [messages, selectedClientId, user]);

  useEffect(() => {
    if (!messageViewportRef.current) {
      return;
    }

    messageViewportRef.current.scrollTop = messageViewportRef.current.scrollHeight;
  }, [conversationMessages]);

  const handleSend = async () => {
    if (!user) {
      toast.error('Sign in to send messages');
      return;
    }

    if (!selectedClientId) {
      toast.error('Choose a client to start chatting');
      return;
    }

    const body = draft.trim();
    if (!body) {
      return;
    }

    const payload: TablesInsert<'client_messages'> = {
      body,
      recipient_user_id: selectedClientId,
      sender_user_id: user.id,
    };

    setSending(true);

    try {
      const { data, error } = await supabase
        .from('client_messages')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setMessages((current) => [data as DirectMessage, ...current.filter((message) => message.id !== data.id)]);
      }

      setDraft('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to send message';
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Client messaging requires sign-in</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sign in to send secure direct messages to other AegisLink clients from inside the app.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Direct client messaging</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Choose a client, send updates in-app, and receive replies live through Supabase realtime.
            </p>
          </div>
        </div>
      </div>

      {refreshError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{refreshError}</span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Clients</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {clients.length === 0 ? 'No other clients available yet.' : `Connected directory: ${clients.length} client${clients.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading conversations...
          </div>
        ) : clients.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            Invite another client to create an account, then their inbox will appear here.
          </div>
        ) : (
          <div className="space-y-2 px-3 py-3">
            {threadSummaries.map((thread) => (
              <button
                key={thread.client.user_id}
                onClick={() => setSelectedClientId(thread.client.user_id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                  selectedClientId === thread.client.user_id
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-border bg-background hover:border-primary/20',
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {getClientInitials(thread.client)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{getClientLabel(thread.client)}</p>
                    {thread.unreadCount > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {thread.latestMessage?.body || 'No messages yet'}
                  </p>
                </div>
                <div className="text-right text-[10px] text-muted-foreground">
                  {thread.latestMessage ? formatMessageTime(thread.latestMessage.created_at) : 'New'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          {selectedClient ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {getClientInitials(selectedClient)}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{getClientLabel(selectedClient)}</h3>
                <p className="text-[11px] text-muted-foreground">Realtime conversation</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserRound className="h-4 w-4" />
              Select a client to open the conversation
            </div>
          )}
        </div>

        <div ref={messageViewportRef} className="h-[320px] space-y-3 overflow-y-auto px-4 py-4">
          {!selectedClient ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Pick a client above to start an in-app conversation.
            </div>
          ) : conversationMessages.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No messages yet. Send the first update to start this thread.
            </div>
          ) : (
            conversationMessages.map((message) => {
              const sentByCurrentUser = message.sender_user_id === user.id;

              return (
                <div
                  key={message.id}
                  className={cn('flex', sentByCurrentUser ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 shadow-sm',
                      sentByCurrentUser
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-foreground',
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                    <div
                      className={cn(
                        'mt-1 flex items-center gap-2 text-[10px]',
                        sentByCurrentUser ? 'text-primary-foreground/70' : 'text-muted-foreground',
                      )}
                    >
                      <span>{formatMessageTime(message.created_at)}</span>
                      {sentByCurrentUser && (
                        <span>{message.read_at ? 'Seen' : 'Sent'}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border px-4 py-4">
          <div className="space-y-3">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={selectedClient ? `Message ${getClientLabel(selectedClient)}...` : 'Choose a client first'}
              disabled={!selectedClient || sending}
              maxLength={2000}
              className="min-h-[96px] resize-none bg-background"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!sending) {
                    void handleSend();
                  }
                }
              }}
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground">
                Press Enter to send. Use Shift+Enter for a new line.
              </p>
              <button
                onClick={() => void handleSend()}
                disabled={!selectedClient || !draft.trim() || sending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
