import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Send,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Menu,
  X,
  User,
  ShieldCheck,
  ClipboardCheck,
  Building2,
  Calculator,
  Award,
  FileSearch,
  MessageSquare,
  Eraser,
  ExternalLink,
  Star,
} from 'lucide-react';
import type {
  ChatMessage,
  Conversation,
  Department,
  FeeStructure,
  Language,
  Program,
  Scholarship,
  StudentUser,
  UniversitySettings,
} from '../types';
import { ApiError, apiFetch } from '../utils/api';
import { FormattedMessage } from '../utils/formatMessage';
import { BrandMark, DIU_EMBLEM_URL } from './BrandMark';
import { StudentAuthModal } from './StudentAuthModal';
import { StudentToolsPanel, type StudentToolTab } from './StudentToolsPanel';

interface StudentWorkspaceProps {
  departments: Department[];
  programs: Program[];
  feeStructures: FeeStructure[];
  scholarships: Scholarship[];
  settings: UniversitySettings | null;
  onOpenAdmin: () => void;
}

const WELCOME_EN =
  'Hello! Welcome to Daffodil International University. I am your AI Admission Assistant. How can I help you today?';
const WELCOME_BN =
  'ড্যাফোডিল ইন্টারন্যাশনাল ইউনিভার্সিটিতে আপনাকে স্বাগতম। আমি আপনার AI Admission Assistant। DIU-এর ভর্তি, বিভাগ, খরচ ও স্কলারশিপ সম্পর্কে কী জানতে চান?';

const QUICK_ACTIONS = [
  {
    id: 'elig',
    labelEn: 'Check Admission Eligibility',
    labelBn: 'ভর্তি যোগ্যতা যাচাই',
    promptEn: 'What are the undergraduate and postgraduate admission eligibility requirements at DIU?',
    promptBn: 'DIU-তে স্নাতক ও স্নাতকোত্তর ভর্তির যোগ্যতা কী কী?',
  },
  {
    id: 'depts',
    labelEn: 'Explore Departments',
    labelBn: 'বিভাগসমূহ জানুন',
    promptEn: 'What departments and degree programs are available at DIU?',
    promptBn: 'ড্যাফোডিল ইন্টারন্যাশনাল ইউনিভার্সিটিতে কী কী বিভাগ ও প্রোগ্রাম রয়েছে?',
  },
  {
    id: 'fees',
    labelEn: 'Tuition Fees',
    labelBn: 'টিউশন ফি',
    promptEn: 'Can you explain the tuition fee structure, admission fee, and per-credit costs at DIU?',
    promptBn: 'DIU-এর টিউশন ফি, ভর্তি ফি এবং প্রতি ক্রেডিট খরচ সম্পর্কে বিস্তারিত জানান।',
  },
  {
    id: 'sch',
    labelEn: 'Scholarships',
    labelBn: 'স্কলারশিপ ও ওয়েভার',
    promptEn: 'What scholarships and tuition fee waivers does DIU offer?',
    promptBn: 'DIU কী কী ধরনের স্কলারশিপ ও টিউশন ফি ওয়েভার প্রদান করে?',
  },
  {
    id: 'proc',
    labelEn: 'Admission Process',
    labelBn: 'ভর্তি প্রক্রিয়া',
    promptEn: 'What is the step-by-step admission process at DIU?',
    promptBn: 'DIU-তে ভর্তির ধাপসমূহ এবং আবেদন প্রক্রিয়া কী?',
  },
  {
    id: 'docs',
    labelEn: 'Required Documents',
    labelBn: 'প্রয়োজনীয় কাগজপত্র',
    promptEn: 'What documents do I need to submit for DIU admission?',
    promptBn: 'DIU-তে ভর্তির সময় কী কী কাগজপত্র জমা দিতে হয়?',
  },
];

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function StudentWorkspace({
  departments,
  programs,
  feeStructures,
  scholarships,
  settings,
  onOpenAdmin,
}: StudentWorkspaceProps) {
  const [language, setLanguage] = useState<Language>('en');
  const [token, setToken] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<StudentToolTab>('chat');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackOpenId, setFeedbackOpenId] = useState<string | null>(null);
  const [ratingDraft, setRatingDraft] = useState<number>(5);
  const [commentDraft, setCommentDraft] = useState<string>('');

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const refreshGuestToken = async (): Promise<string> => {
    const res = await apiFetch<{ token?: string }>('/api/auth/guest', { method: 'POST' });
    if (!res?.token || typeof res.token !== 'string') {
      throw new Error('Unable to initialize a chat session. Please refresh and try again.');
    }
    setToken(res.token);
    return res.token;
  };

  // Initialize a temporary guest session token in memory on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiFetch<{ token?: string }>('/api/auth/guest', { method: 'POST' });
        if (mounted && res?.token && typeof res.token === 'string') {
          setToken(res.token);
        }
      } catch {
        // Handled lazily on first message if network delayed
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const ensureSessionToken = async (): Promise<string> => {
    if (token) return token;
    return refreshGuestToken();
  };

  // Load conversations whenever token or search changes
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const qs = searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : '';
        const res = await apiFetch<{ conversations?: Conversation[] }>(`/api/conversations${qs}`, {
          token,
        });
        if (active) {
          const valid = Array.isArray(res?.conversations)
            ? res.conversations.filter((c): c is Conversation => Boolean(c && typeof c.id === 'string'))
            : [];
          setConversations(valid);
        }
      } catch (err) {
        if (active && err instanceof ApiError && err.status === 401 && !student) {
          try {
            await refreshGuestToken();
          } catch {
            // Ignore transient refresh failure
          }
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token, searchQuery, student]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const loadConversation = async (convId: string) => {
    if (!token || !convId) return;
    setChatError(null);
    setActiveTool('chat');
    setSidebarOpen(false);
    try {
      const res = await apiFetch<{ conversation?: Conversation; messages?: ChatMessage[] }>(
        `/api/conversations/${convId}/messages`,
        { token }
      );
      if (!res?.conversation?.id) {
        throw new Error('Conversation data was incomplete.');
      }
      const validMessages = Array.isArray(res.messages)
        ? res.messages.filter((m): m is ChatMessage => Boolean(m && typeof m.id === 'string'))
        : [];
      setActiveConvId(res.conversation.id);
      setMessages(validMessages);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to load conversation.');
    }
  };

  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setChatError(null);
    setActiveTool('chat');
    setSidebarOpen(false);
  };

  const handleClearCurrentConversation = async () => {
    if (activeConvId && token) {
      try {
        await apiFetch(`/api/conversations/${activeConvId}`, {
          method: 'DELETE',
          token,
        });
        setConversations((prev) => prev.filter((c) => c && c.id !== activeConvId));
      } catch {
        // Fallback to local reset
      }
    }
    setActiveConvId(null);
    setMessages([]);
    setChatError(null);
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || !convId) return;
    try {
      await apiFetch(`/api/conversations/${convId}`, { method: 'DELETE', token });
      setConversations((prev) => prev.filter((c) => c && c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
  };

  const handleClearAllHistory = async () => {
    if (!token) return;
    try {
      await apiFetch('/api/conversations', { method: 'DELETE', token });
      setConversations([]);
      setActiveConvId(null);
      setMessages([]);
    } catch {
      // ignore
    }
  };

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || sending) return;

    setActiveTool('chat');
    setChatError(null);
    if (!textToSend) setInputText('');
    setSending(true);

    const optimisticUser: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeConvId ?? 'pending',
      role: 'user',
      content: text,
      language,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev.filter((m): m is ChatMessage => Boolean(m && m.id)), optimisticUser]);

    const postChatMessage = async (authToken: string, convIdToUse: string | null) =>
      apiFetch<{
        conversation?: Conversation;
        userMessage?: ChatMessage;
        assistantMessage?: ChatMessage;
      }>('/api/chat/message', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          conversationId: convIdToUse,
          message: text,
          language,
        }),
      });

    try {
      let activeToken = await ensureSessionToken();
      let res: {
        conversation?: Conversation;
        userMessage?: ChatMessage;
        assistantMessage?: ChatMessage;
      };

      try {
        res = await postChatMessage(activeToken, activeConvId);
      } catch (innerErr) {
        // If a guest session token became stale (e.g., server restart), refresh and retry once
        if (innerErr instanceof ApiError && innerErr.status === 401 && !student) {
          activeToken = await refreshGuestToken();
          setActiveConvId(null);
          res = await postChatMessage(activeToken, null);
        } else {
          throw innerErr;
        }
      }

      if (!res?.conversation?.id || !res?.userMessage?.id || !res?.assistantMessage?.id) {
        throw new Error('Received an incomplete response from DIU Assistant. Please try again.');
      }

      const nextConv = res.conversation;
      const savedUserMsg = res.userMessage;
      const savedAssistantMsg = res.assistantMessage;

      setActiveConvId(nextConv.id);
      setMessages((prev) => [
        ...prev.filter((m): m is ChatMessage => Boolean(m && m.id && m.id !== optimisticUser.id)),
        savedUserMsg,
        savedAssistantMsg,
      ]);
      setConversations((prev) => {
        const others = prev.filter((c): c is Conversation => Boolean(c && c.id && c.id !== nextConv.id));
        return [nextConv, ...others];
      });
    } catch (err) {
      setMessages((prev) =>
        prev.filter((m): m is ChatMessage => Boolean(m && m.id && m.id !== optimisticUser.id))
      );
      if (!textToSend) {
        setInputText(text);
      }
      setChatError(err instanceof Error ? err.message : 'Failed to reach DIU Assistant.');
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId((prev) => (prev === msgId ? null : prev)), 1800);
    } catch {
      // clipboard blocked
    }
  };

  const submitFeedback = async (
    msgId: string,
    helpful: boolean,
    rating?: number,
    comment?: string
  ) => {
    if (!token || !msgId) return;
    try {
      const res = await apiFetch<{ message?: ChatMessage }>('/api/chat/feedback', {
        method: 'POST',
        token,
        body: JSON.stringify({ messageId: msgId, helpful, rating, comment }),
      });
      if (res?.message?.id) {
        const updatedMsg = res.message;
        setMessages((prev) =>
          prev
            .filter((m): m is ChatMessage => Boolean(m && m.id))
            .map((m) => (m.id === msgId ? updatedMsg : m))
        );
      }
      setFeedbackOpenId(null);
      setCommentDraft('');
    } catch {
      // ignore
    }
  };

  const handleLogoutStudent = async () => {
    setStudent(null);
    setConversations([]);
    setActiveConvId(null);
    setMessages([]);
    try {
      await refreshGuestToken();
    } catch {
      setToken(null);
    }
  };

  const activeConv = conversations.find((c) => c && c.id === activeConvId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F8FAF9] text-[#111827]">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ================================================================= */}
      {/* LEFT SIDEBAR */}
      {/* ================================================================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] shrink-0 flex-col border-r border-[#E4EAE6] bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Conversation and tool navigation"
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#E4EAE6]">
          <BrandMark size="sm" />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F6F4] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* New Chat + Search */}
        <div className="p-3 space-y-2.5 border-b border-[#E4EAE6]">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#064E3B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#065F46] transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            {language === 'bn' ? 'নতুন চ্যাট' : 'New Chat'}
          </button>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-[#9CA3AF] absolute left-3 top-2.5" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'bn' ? 'চ্যাট ইতিহাস খুঁজুন...' : 'Search chat history...'}
              aria-label="Search chat history"
              className="w-full rounded-xl border border-[#E4EAE6] bg-[#F8FAF9] pl-8 pr-3 py-1.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#065F46] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Interactive DIU Tools */}
        <div className="px-3 py-3 border-b border-[#E4EAE6]">
          <p className="px-2 mb-1.5 text-[11px] font-semibold text-[#6B7280]">
            {language === 'bn' ? 'ভর্তি টুলস' : 'Admission Tools'}
          </p>
          <nav className="space-y-0.5">
            {(
              [
                { id: 'chat', labelEn: 'AI Admission Chat', labelBn: 'AI ভর্তি চ্যাট', icon: MessageSquare },
                { id: 'eligibility', labelEn: 'Eligibility Checker', labelBn: 'যোগ্যতা যাচাই', icon: ClipboardCheck },
                { id: 'departments', labelEn: 'Departments & Compare', labelBn: 'বিভাগ ও তুলনা', icon: Building2 },
                { id: 'fees', labelEn: 'Tuition Fee Calculator', labelBn: 'টিউশন ফি ক্যালকুলেটর', icon: Calculator },
                { id: 'scholarships', labelEn: 'Scholarship Checker', labelBn: 'স্কলারশিপ যাচাই', icon: Award },
                { id: 'tracking', labelEn: 'Application Tracking', labelBn: 'আবেদন ট্র্যাকিং', icon: FileSearch },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = activeTool === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTool(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#064E3B]/10 text-[#064E3B] font-semibold'
                      : 'text-[#374151] hover:bg-[#F3F6F4]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{language === 'bn' ? item.labelBn : item.labelEn}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Recent Conversations */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <p className="text-[11px] font-semibold text-[#6B7280]">
              {language === 'bn' ? 'সাম্প্রতিক আলোচনা' : 'Recent Conversations'}
            </p>
            {conversations.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllHistory}
                className="text-[11px] font-medium text-[#6B7280] hover:text-red-600"
              >
                {language === 'bn' ? 'সব মুছুন' : 'Clear All'}
              </button>
            )}
          </div>

          {conversations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-[#9CA3AF]">
              {language === 'bn'
                ? 'এখনো কোনো সংরক্ষিত চ্যাট নেই।'
                : 'No saved conversations yet.'}
            </p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => {
                const isSelected = activeConvId === conv.id && activeTool === 'chat';
                return (
                  <div
                    key={conv.id}
                    className={`group flex items-center justify-between gap-1 rounded-xl px-2.5 py-2 transition-colors ${
                      isSelected ? 'bg-[#064E3B]/8' : 'hover:bg-[#F3F6F4]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => loadConversation(conv.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p
                        className={`truncate text-xs ${
                          isSelected ? 'font-semibold text-[#064E3B]' : 'font-medium text-[#1F2937]'
                        }`}
                      >
                        {conv.title}
                      </p>
                      <p className="truncate text-[11px] text-[#6B7280]">
                        {conv.language === 'bn' ? 'বাংলা' : 'EN'} · {conv.messageCount} msgs
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      aria-label={`Delete conversation ${conv.title}`}
                      className="rounded-lg p-1 text-[#9CA3AF] opacity-70 hover:bg-red-50 hover:text-red-600 hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar Footer: Student Auth & Admin Switch */}
        <div className="border-t border-[#E4EAE6] p-3 space-y-1.5">
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            aria-label={student ? `Student Profile: ${student.name}` : 'Student Login or Profile'}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[#E4EAE6] bg-[#F8FAF9] px-3 py-2 text-left hover:bg-[#F3F6F4] transition-colors"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#064E3B]/10 text-[#064E3B]">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#111827]">
                {student ? student.name : language === 'bn' ? 'স্টুডেন্ট লগইন' : 'Student Login / Profile'}
              </p>
              <p className="truncate text-[11px] text-[#6B7280]">
                {student ? student.email : 'Guest Session (Temporary)'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenAdmin}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-[#4B5563] hover:bg-[#F3F6F4] hover:text-[#111827] transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-[#065F46]" />
              Admin Dashboard
            </span>
            <span className="text-[11px] text-[#9CA3AF]">Staff</span>
          </button>
        </div>
      </aside>

      {/* ================================================================= */}
      {/* MAIN CONTENT VIEWPORT */}
      {/* ================================================================= */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Bar (Clean 3-Zone Contract) */}
        <header className="flex items-center justify-between gap-4 border-b border-[#E4EAE6] bg-white px-4 py-3 sm:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="rounded-lg p-2 text-[#4B5563] hover:bg-[#F3F6F4] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-sm font-bold text-[#111827] sm:text-base">
                {activeConv ? activeConv.title : 'DIU Admission Assistant'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Bengali / English Segmented Switcher */}
            <div
              className="flex items-center rounded-xl bg-[#F3F6F4] p-1 border border-[#E4EAE6]"
              role="group"
              aria-label="Language switcher"
            >
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  language === 'en'
                    ? 'bg-white text-[#064E3B] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage('bn')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  language === 'bn'
                    ? 'bg-white text-[#064E3B] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                বাংলা
              </button>
            </div>

            {activeTool === 'chat' && messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearCurrentConversation}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4EAE6] bg-white px-3 py-1.5 text-xs font-medium text-[#4B5563] hover:bg-[#F3F6F4] whitespace-nowrap"
              >
                <Eraser className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {language === 'bn' ? 'চ্যাট মুছুন' : 'Clear Chat'}
                </span>
              </button>
            )}
          </div>
        </header>

        {/* Either Student Tool Panel OR Main Chat Conversation */}
        {activeTool !== 'chat' ? (
          <StudentToolsPanel
            activeTool={activeTool}
            language={language}
            departments={departments}
            programs={programs}
            feeStructures={feeStructures}
            scholarships={scholarships}
            settings={settings}
            onBackToChat={() => setActiveTool('chat')}
            onAskAi={(q) => sendMessage(q)}
          />
        ) : (
          <>
            <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
              <div className="mx-auto max-w-3xl space-y-5">
                {/* Empty / Welcome State */}
                {messages.length === 0 ? (
                  <div className="py-2 sm:py-10 space-y-5 sm:space-y-7">
                    <div className="rounded-2xl border border-[#E4EAE6] bg-white p-4 sm:p-8 shadow-xs">
                      <div className="flex items-start gap-3.5 sm:gap-4">
                        <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 overflow-hidden rounded-2xl border border-[#E4EAE6] bg-[#064E3B]">
                          <img
                            src={DIU_EMBLEM_URL}
                            alt="DIU Admission Assistant"
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-[#065F46]">
                            Daffodil International University · Official AI Admission Guide
                          </p>
                          <h2 className="font-display text-lg sm:text-xl font-bold text-[#111827] leading-snug text-balance">
                            {language === 'bn' ? WELCOME_BN : WELCOME_EN}
                          </h2>
                          <p className="text-xs text-[#6B7280]">
                            Ask in Bengali or English · Grounded in verified DIU admission circulars & department records
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 6 Quick Action Buttons */}
                    <div className="space-y-2.5">
                      <p className="text-xs font-semibold text-[#6B7280] px-1">
                        {language === 'bn' ? 'জনপ্রিয় প্রশ্নসমূহ' : 'Quick Actions'}
                      </p>
                      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {QUICK_ACTIONS.map((qa) => (
                          <button
                            key={qa.id}
                            type="button"
                            onClick={() =>
                              sendMessage(language === 'bn' ? qa.promptBn : qa.promptEn)
                            }
                            className="flex items-center justify-between rounded-xl border border-[#E4EAE6] bg-white px-4 py-3 text-left text-xs font-semibold text-[#111827] hover:border-[#065F46] hover:bg-[#064E3B]/4 transition-colors"
                          >
                            <span>{language === 'bn' ? qa.labelBn : qa.labelEn}</span>
                            <Send className="h-3.5 w-3.5 text-[#065F46] shrink-0 ml-2" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Conversation Message Stream */
                  messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-3.5 ${
                            isUser
                              ? 'bg-[#064E3B] text-white'
                              : 'border border-[#E4EAE6] bg-white text-[#111827]'
                          }`}
                        >
                          {isUser ? (
                            <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          ) : (
                            <FormattedMessage content={msg.content} />
                          )}

                          {/* Grounded Source References (Zero-Pill Clean Inline Metadata) */}
                          {!isUser && msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 border-t border-[#E4EAE6] pt-2.5 space-y-1">
                              <p className="text-[11px] font-semibold text-[#6B7280]">
                                Verified Knowledge Sources
                              </p>
                              <div className="space-y-1">
                                {msg.sources.map((src) => (
                                  <div
                                    key={src.docId}
                                    className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#4B5563]"
                                  >
                                    <span className="font-medium text-[#111827]">{src.title}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{src.category}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{src.effectiveSemester}</span>
                                    {src.verificationStatus === 'pending_verification' && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="text-amber-700 font-medium">
                                          Pending Verification
                                        </span>
                                      </>
                                    )}
                                    {src.sourceUrl && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <a
                                          href={src.sourceUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-0.5 text-[#065F46] hover:underline"
                                        >
                                          Source
                                          <ExternalLink className="h-2.5 w-2.5" />
                                        </a>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Message Footer: Timestamp + Copy + Feedback */}
                          <div
                            className={`mt-2.5 flex flex-wrap items-center justify-between gap-3 text-[11px] ${
                              isUser ? 'text-white/75' : 'text-[#6B7280]'
                            }`}
                          >
                            <span className="font-mono-num">{formatTime(msg.createdAt)}</span>

                            {!isUser && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(msg.id, msg.content)}
                                  aria-label="Copy response"
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-[#F3F6F4] hover:text-[#111827]"
                                >
                                  {copiedId === msg.id ? (
                                    <>
                                      <Check className="h-3 w-3 text-[#065F46]" />
                                      <span className="text-[#065F46]">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => submitFeedback(msg.id, true, 5)}
                                  aria-label="Mark response helpful"
                                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${
                                    msg.feedback?.helpful === true
                                      ? 'bg-[#064E3B]/10 text-[#064E3B] font-semibold'
                                      : 'hover:bg-[#F3F6F4] hover:text-[#111827]'
                                  }`}
                                >
                                  <ThumbsUp className="h-3 w-3" />
                                  <span>Helpful</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setFeedbackOpenId((prev) => (prev === msg.id ? null : msg.id));
                                    setRatingDraft(2);
                                  }}
                                  aria-label="Mark response not helpful"
                                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${
                                    msg.feedback?.helpful === false
                                      ? 'bg-red-50 text-red-700 font-semibold'
                                      : 'hover:bg-[#F3F6F4] hover:text-[#111827]'
                                  }`}
                                >
                                  <ThumbsDown className="h-3 w-3" />
                                  <span>Not Helpful</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Optional Rating & Written Feedback Form */}
                          {!isUser && feedbackOpenId === msg.id && (
                            <div className="mt-3 rounded-xl border border-[#E4EAE6] bg-[#F8FAF9] p-3 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-[#374151]">
                                  Rate & Share Feedback (Optional)
                                </span>
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      onClick={() => setRatingDraft(star)}
                                      aria-label={`Rate ${star} stars`}
                                      className="p-0.5"
                                    >
                                      <Star
                                        className={`h-3.5 w-3.5 ${
                                          star <= ratingDraft
                                            ? 'fill-amber-400 text-amber-500'
                                            : 'text-[#D1D5DB]'
                                        }`}
                                      />
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={commentDraft}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                placeholder="What was missing or unclear?"
                                className="w-full rounded-lg border border-[#D1D5DB] bg-white px-2.5 py-1.5 text-xs focus:border-[#065F46] focus:outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setFeedbackOpenId(null)}
                                  className="rounded-lg px-2.5 py-1 text-xs text-[#6B7280] hover:bg-[#E4EAE6]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    submitFeedback(msg.id, false, ratingDraft, commentDraft)
                                  }
                                  className="rounded-lg bg-[#064E3B] px-3 py-1 text-xs font-semibold text-white hover:bg-[#065F46]"
                                >
                                  Submit Feedback
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Typing Indicator */}
                {sending && (
                  <div className="flex justify-start" aria-live="polite">
                    <div className="rounded-2xl border border-[#E4EAE6] bg-white px-4 py-3 text-xs text-[#4B5563] flex items-center gap-2">
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#065F46] animate-bounce" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[#065F46] animate-bounce [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[#065F46] animate-bounce [animation-delay:240ms]" />
                      </span>
                      <span>
                        {language === 'bn'
                          ? 'DIU তথ্যভাণ্ডার যাচাই করা হচ্ছে...'
                          : 'Checking verified DIU records...'}
                      </span>
                    </div>
                  </div>
                )}

                {chatError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                    {chatError}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </main>

            {/* Fixed Bottom Chat Input */}
            <footer className="border-t border-[#E4EAE6] bg-white px-4 py-3 sm:px-6 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="mx-auto max-w-3xl"
              >
                <div className="flex items-end gap-2 rounded-2xl border border-[#D1D5DB] bg-[#F8FAF9] p-2 focus-within:border-[#065F46] focus-within:bg-white transition-colors">
                  <textarea
                    rows={1}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={
                      language === 'bn'
                        ? 'DIU ভর্তি, বিভাগ বা ফি লিখুন...'
                        : 'Ask about DIU admissions or fees...'
                    }
                    aria-label="Ask DIU Admission Assistant"
                    className="max-h-32 min-h-[42px] flex-1 resize-none bg-transparent px-2.5 py-2.5 text-sm leading-snug text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || !inputText.trim()}
                    aria-label="Send message"
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#064E3B] px-4 text-xs font-semibold text-white hover:bg-[#065F46] disabled:opacity-45 transition-colors shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {language === 'bn' ? 'পাঠান' : 'Send'}
                    </span>
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[11px] text-[#6B7280]">
                  DIU Admission Hotline: {settings?.admissionPhone ?? '+8809617901212'} ·{' '}
                  {settings?.admissionEmail ?? 'admission@daffodilvarsity.edu.bd'}
                </p>
              </form>
            </footer>
          </>
        )}
      </div>

      {/* Student Login / Register / Profile Modal */}
      <StudentAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        student={student}
        token={token}
        language={language}
        programs={programs}
        onAuthenticated={(stu, newToken) => {
          setStudent(stu);
          setToken(newToken);
          setLanguage(stu.preferredLanguage);
        }}
        onProfileUpdated={(stu) => setStudent(stu)}
        onLogout={handleLogoutStudent}
      />
    </div>
  );
}
