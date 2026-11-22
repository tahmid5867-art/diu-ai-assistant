import React, { useState } from 'react';
import {
  Download,
  CheckCircle2,
  Copy,
  Check,
  UserPlus,
  MessageCircle,
  Search,
} from 'lucide-react';
import type {
  AdminRole,
  AdminUser,
  AuditLog,
  ChatMessage,
  Conversation,
  Language,
  UnansweredQuestion,
  UniversitySettings,
} from '../types';
import { apiFetch } from '../utils/api';

export interface OverviewStats {
  totalConversations: number;
  todayConversations: number;
  registeredStudents: number;
  openUnansweredQuestions: number;
  knowledgeDocuments: number;
  indexedChunks: number;
  satisfactionPct: number | null;
  ratedCount: number;
  unansweredRatePct: number;
  languageSplit: { en: number; bn: number };
  apiMetrics: {
    totalCalls: number;
    totalErrors: number;
    lastError?: string;
    lastErrorAt?: string;
  };
  geminiConfigured: boolean;
}

interface AdminMonitoringSectionProps {
  section: 'chats' | 'unanswered' | 'analytics' | 'users' | 'settings';
  token: string;
  currentRole: AdminRole;
  chatLogs: { conversation: Conversation; messages: ChatMessage[] }[];
  unanswered: UnansweredQuestion[];
  stats: OverviewStats | null;
  popularQuestions: { question: string; count: number }[];
  popularDepartments: { code: string; name: string; count: number }[];
  dailySeries: { date: string; total: number; en: number; bn: number }[];
  admins: AdminUser[];
  auditLogs: AuditLog[];
  settings: UniversitySettings | null;
  onRefresh: () => Promise<void>;
}

export function AdminMonitoringSection({
  section,
  token,
  currentRole,
  chatLogs,
  unanswered,
  stats,
  popularQuestions,
  popularDepartments,
  dailySeries,
  admins,
  auditLogs,
  settings,
  onRefresh,
}: AdminMonitoringSectionProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chat monitoring filter
  const [chatSearch, setChatSearch] = useState('');
  const [chatLang, setChatLang] = useState<'all' | 'en' | 'bn'>('all');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    chatLogs[0]?.conversation?.id ?? null
  );

  // Unanswered resolution
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveAnswer, setResolveAnswer] = useState('');
  const [resolveUrl, setResolveUrl] = useState('');
  const [convertToFaq, setConvertToFaq] = useState(true);
  const [addToKb, setAddToKb] = useState(true);

  // Analytics CSV Date Filter
  const [csvFrom, setCsvFrom] = useState('');
  const [csvTo, setCsvTo] = useState('');

  // Admin Users
  const [newAdmName, setNewAdmName] = useState('');
  const [newAdmEmail, setNewAdmEmail] = useState('');
  const [newAdmPassword, setNewAdmPassword] = useState('');
  const [newAdmRole, setNewAdmRole] = useState<AdminRole>('CONTENT_ADMIN');

  // Settings & Widget Config
  const [phone, setPhone] = useState(settings?.admissionPhone ?? '+8809617901212');
  const [admEmail, setAdmEmail] = useState(settings?.admissionEmail ?? 'admission@daffodilvarsity.edu.bd');
  const [address, setAddress] = useState(
    settings?.address ?? 'Daffodil Smart City, Birulia, Savar, Dhaka-1216, Bangladesh'
  );
  const [websiteUrl, setWebsiteUrl] = useState(settings?.websiteUrl ?? 'https://daffodilvarsity.edu.bd/');
  const [portalUrl, setPortalUrl] = useState(
    settings?.officialPortalUrl ?? 'https://admission.daffodilvarsity.edu.bd/'
  );
  const [widgetColor, setWidgetColor] = useState(settings?.widget.primaryColor ?? '#064E3B');
  const [widgetAccent, setWidgetAccent] = useState(settings?.widget.accentColor ?? '#84CC16');
  const [widgetWelcomeEn, setWidgetWelcomeEn] = useState(settings?.widget.welcomeMessageEn ?? '');
  const [widgetWelcomeBn, setWidgetWelcomeBn] = useState(settings?.widget.welcomeMessageBn ?? '');
  const [widgetLang, setWidgetLang] = useState<Language>(settings?.widget.defaultLanguage ?? 'en');
  const [widgetPos, setWidgetPos] = useState<'bottom-right' | 'bottom-left'>(
    settings?.widget.position ?? 'bottom-right'
  );
  const [allowedDomains, setAllowedDomains] = useState(
    (settings?.widget.allowedDomains ?? ['daffodilvarsity.edu.bd']).join(', ')
  );
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const handleResolveUnanswered = async (id: string, e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/unanswered/${id}/resolve`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          answer: resolveAnswer,
          sourceUrl: resolveUrl || undefined,
          convertToFaq,
          addToKnowledge: addToKb,
        }),
      });
      setResolvingId(null);
      setResolveAnswer('');
      setResolveUrl('');
      setNotice('Question resolved and verified knowledge updated.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve question');
    }
  };

  const handleDownloadCsv = async () => {
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (csvFrom) qs.set('from', csvFrom);
      if (csvTo) qs.set('to', csvTo);
      const res = await fetch(`/api/admin/analytics/export.csv?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('CSV export failed');
      const csvText = await res.text();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'diu-assistant-analytics.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download CSV');
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: newAdmName,
          email: newAdmEmail,
          password: newAdmPassword,
          role: newAdmRole,
        }),
      });
      setNewAdmName('');
      setNewAdmEmail('');
      setNewAdmPassword('');
      setNotice('Staff admin account created.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin');
    }
  };

  const toggleAdminActive = async (a: AdminUser) => {
    await apiFetch(`/api/admin/users/${a.id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ active: !a.active }),
    });
    await onRefresh();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          admissionPhone: phone,
          admissionEmail: admEmail,
          address,
          websiteUrl,
          officialPortalUrl: portalUrl,
          widget: {
            primaryColor: widgetColor,
            accentColor: widgetAccent,
            welcomeMessageEn: widgetWelcomeEn,
            welcomeMessageBn: widgetWelcomeBn,
            defaultLanguage: widgetLang,
            position: widgetPos,
            allowedDomains: allowedDomains
              .split(',')
              .map((d) => d.trim())
              .filter(Boolean),
          },
        }),
      });
      setNotice('Settings & embed widget configuration saved.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-diu-assistant-host';
  const embedSnippet = `<script src="${origin}/api/widget/embed.js" defer></script>`;

  const filteredChats = chatLogs.filter((entry) => {
    const conversation = entry?.conversation;
    if (!conversation?.id) return false;
    if (chatLang !== 'all' && conversation.language !== chatLang) return false;
    if (
      chatSearch.trim() &&
      !conversation.title.toLowerCase().includes(chatSearch.toLowerCase()) &&
      !conversation.ownerLabel.toLowerCase().includes(chatSearch.toLowerCase()) &&
      !conversation.id.toLowerCase().includes(chatSearch.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const activeChat = filteredChats.find((c) => c.conversation?.id === selectedConvId) ?? filteredChats[0];

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-[#059669]/30 bg-[#059669]/8 px-4 py-2.5 text-xs text-[#064E3B]">
          {notice}
        </div>
      )}

      {/* ================================================================= */}
      {/* CHAT MONITORING */}
      {/* ================================================================= */}
      {section === 'chats' && (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-5 rounded-2xl border border-[#E4EAE6] bg-white overflow-hidden">
            <div className="p-3.5 border-b border-[#E4EAE6] space-y-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[#9CA3AF] absolute left-3 top-2.5" />
                <input
                  type="search"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search ID, student, or topic..."
                  className="w-full rounded-xl border border-[#D1D5DB] pl-8 pr-3 py-1.5 text-xs"
                />
              </div>
              <div className="flex gap-1 rounded-xl bg-[#F3F6F4] p-0.5">
                {(['all', 'en', 'bn'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setChatLang(l)}
                    className={`flex-1 rounded-lg py-1 text-xs font-medium ${
                      chatLang === l ? 'bg-white text-[#111827] shadow-xs' : 'text-[#6B7280]'
                    }`}
                  >
                    {l === 'all' ? 'All' : l === 'en' ? 'English' : 'বাংলা'}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-[#E4EAE6]">
              {filteredChats.length === 0 ? (
                <p className="p-6 text-center text-xs text-[#6B7280]">No conversations recorded yet.</p>
              ) : (
                filteredChats.map(({ conversation }) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConvId(conversation.id)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      activeChat?.conversation.id === conversation.id
                        ? 'bg-[#064E3B]/8'
                        : 'hover:bg-[#F8FAF9]'
                    }`}
                  >
                    <p className="truncate font-display text-xs font-semibold text-[#111827]">
                      {conversation.title}
                    </p>
                    <p className="truncate text-[11px] text-[#6B7280] mt-0.5">
                      {conversation.ownerLabel} · {conversation.language.toUpperCase()} ·{' '}
                      {conversation.messageCount} msgs
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-7 rounded-2xl border border-[#E4EAE6] bg-white p-5">
            {!activeChat ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-[#6B7280]">
                <MessageCircle className="h-8 w-8 text-[#9CA3AF] mb-2" />
                Select a conversation on the left to inspect messages and student feedback.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border-b border-[#E4EAE6] pb-3">
                  <p className="font-display text-sm font-bold text-[#111827]">
                    {activeChat.conversation.title}
                  </p>
                  <p className="text-xs text-[#6B7280] font-mono-num">
                    ID: {activeChat.conversation.id} · {activeChat.conversation.ownerLabel} ·{' '}
                    {new Date(activeChat.conversation.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="max-h-[450px] overflow-y-auto space-y-3">
                  {activeChat.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl p-3 text-xs ${
                        m.role === 'user'
                          ? 'bg-[#F3F6F4] text-[#111827]'
                          : 'border border-[#E4EAE6] bg-white text-[#1F2937]'
                      }`}
                    >
                      <div className="flex justify-between text-[11px] text-[#6B7280] mb-1">
                        <span className="font-semibold">
                          {m.role === 'user' ? 'Student' : 'DIU Assistant'}
                        </span>
                        <span className="font-mono-num">
                          {new Date(m.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      {m.feedback && (
                        <p className="mt-2 border-t border-[#E4EAE6] pt-1.5 text-[11px] font-medium text-[#065F46]">
                          Feedback: {m.feedback.helpful ? 'Helpful' : 'Not Helpful'}
                          {m.feedback.rating ? ` · ${m.feedback.rating}/5` : ''}
                          {m.feedback.comment ? ` · "${m.feedback.comment}"` : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* UNANSWERED QUESTIONS */}
      {/* ================================================================= */}
      {section === 'unanswered' && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111827]">
              Unanswered & Low-Confidence Questions
            </h2>
            <p className="text-xs text-[#6B7280]">
              Review student queries that triggered the fallback response, provide a verified answer, and optionally promote to FAQs and the RAG Knowledge Base.
            </p>
          </div>

          {unanswered.length === 0 ? (
            <div className="rounded-2xl border border-[#E4EAE6] bg-white p-10 text-center text-sm text-[#6B7280]">
              No unanswered questions logged yet.
            </div>
          ) : (
            unanswered.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-[#6B7280]">
                      {item.language === 'bn' ? 'বাংলা' : 'English'} · Conv: {item.conversationId} ·{' '}
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                    <h3 className="mt-0.5 font-display text-sm font-bold text-[#111827]">
                      {item.question}
                    </h3>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      item.status === 'resolved' ? 'text-[#065F46]' : 'text-amber-700'
                    }`}
                  >
                    {item.status === 'resolved' ? 'Resolved' : 'Needs Verified Answer'}
                  </span>
                </div>

                {item.contextSnippet && (
                  <p className="rounded-xl bg-[#F8FAF9] px-3 py-2 text-xs text-[#4B5563]">
                    <strong>Context:</strong> {item.contextSnippet}
                  </p>
                )}

                {item.status === 'resolved' ? (
                  <div className="rounded-xl border border-[#059669]/25 bg-[#059669]/5 p-3 text-xs text-[#111827]">
                    <p className="font-semibold text-[#064E3B] mb-1">Verified Answer:</p>
                    <p>{item.resolvedAnswer}</p>
                  </div>
                ) : resolvingId === item.id ? (
                  <form
                    onSubmit={(e) => handleResolveUnanswered(item.id, e)}
                    className="space-y-3 border-t border-[#E4EAE6] pt-3"
                  >
                    <textarea
                      rows={3}
                      value={resolveAnswer}
                      onChange={(e) => setResolveAnswer(e.target.value)}
                      placeholder="Write the verified DIU answer..."
                      required
                      className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                    />
                    <input
                      type="url"
                      value={resolveUrl}
                      onChange={(e) => setResolveUrl(e.target.value)}
                      placeholder="Official Source URL (Optional)"
                      className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-4 text-xs text-[#374151]">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={convertToFaq}
                          onChange={(e) => setConvertToFaq(e.target.checked)}
                        />
                        Convert to Published FAQ
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={addToKb}
                          onChange={(e) => setAddToKb(e.target.checked)}
                        />
                        Index into RAG Knowledge Base
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setResolvingId(null)}
                        className="rounded-xl border border-[#D1D5DB] px-3 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-xl bg-[#064E3B] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#065F46]"
                      >
                        Save Verified Answer & Resolve
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setResolvingId(item.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#064E3B] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Add Verified Answer
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* ANALYTICS & CSV EXPORT */}
      {/* ================================================================= */}
      {section === 'analytics' && stats && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#111827]">
                Chatbot Analytics & API Telemetry
              </h2>
              <p className="text-xs text-[#6B7280]">
                Real-time metrics computed from database conversations, feedback, and Gemini API calls.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="Export from date"
                value={csvFrom}
                onChange={(e) => setCsvFrom(e.target.value)}
                className="rounded-xl border border-[#D1D5DB] bg-white px-2.5 py-1.5 text-xs"
              />
              <input
                type="date"
                aria-label="Export to date"
                value={csvTo}
                onChange={(e) => setCsvTo(e.target.value)}
                className="rounded-xl border border-[#D1D5DB] bg-white px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#064E3B] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#E4EAE6] bg-white p-4">
              <p className="text-xs text-[#6B7280]">English vs বাংলা Messages</p>
              <p className="mt-1 font-display text-xl font-bold text-[#111827] tabular-nums">
                {stats.languageSplit.en} EN · {stats.languageSplit.bn} BN
              </p>
            </div>
            <div className="rounded-2xl border border-[#E4EAE6] bg-white p-4">
              <p className="text-xs text-[#6B7280]">Unanswered Rate</p>
              <p className="mt-1 font-display text-xl font-bold text-[#111827] tabular-nums">
                {stats.unansweredRatePct}%
              </p>
            </div>
            <div className="rounded-2xl border border-[#E4EAE6] bg-white p-4">
              <p className="text-xs text-[#6B7280]">Gemini API Calls</p>
              <p className="mt-1 font-display text-xl font-bold text-[#111827] tabular-nums">
                {stats.apiMetrics.totalCalls}
              </p>
            </div>
            <div className="rounded-2xl border border-[#E4EAE6] bg-white p-4">
              <p className="text-xs text-[#6B7280]">API Errors</p>
              <p className="mt-1 font-display text-xl font-bold text-[#111827] tabular-nums">
                {stats.apiMetrics.totalErrors}
              </p>
            </div>
          </div>

          {/* 7-Day Conversation Volume SVG Chart */}
          <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5">
            <h3 className="font-display text-sm font-bold text-[#111827] mb-4">
              7-Day Conversation Volume
            </h3>
            {(() => {
              const maxVal = Math.max(1, ...dailySeries.map((d) => d.total));
              return (
                <div className="grid grid-cols-7 gap-3 items-end h-40 pt-4">
                  {dailySeries.map((d) => {
                    const heightPct = Math.round((d.total / maxVal) * 100);
                    return (
                      <div key={d.date} className="flex flex-col items-center gap-1.5 h-full justify-end">
                        <span className="text-[11px] font-mono-num text-[#374151]">
                          {d.total}
                        </span>
                        <div className="w-full max-w-[36px] rounded-t-lg bg-[#064E3B]/15 flex items-end h-24 overflow-hidden">
                          <div
                            className="w-full rounded-t-lg bg-[#064E3B] transition-all"
                            style={{ height: `${Math.max(4, heightPct)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono-num text-[#6B7280]">
                          {d.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5">
              <h3 className="font-display text-sm font-bold text-[#111827] mb-3">
                Popular Questions
              </h3>
              {popularQuestions.length === 0 ? (
                <p className="text-xs text-[#6B7280]">No student questions logged yet.</p>
              ) : (
                <div className="divide-y divide-[#E4EAE6] text-xs">
                  {popularQuestions.map((pq, i) => (
                    <div key={i} className="flex justify-between gap-3 py-2">
                      <span className="text-[#111827] truncate">{pq.question}</span>
                      <span className="font-mono-num font-semibold text-[#065F46] shrink-0">
                        {pq.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5">
              <h3 className="font-display text-sm font-bold text-[#111827] mb-3">
                Department Interest Mentions
              </h3>
              <div className="divide-y divide-[#E4EAE6] text-xs">
                {popularDepartments.map((pd) => (
                  <div key={pd.code} className="flex justify-between gap-3 py-2">
                    <span className="text-[#111827]">
                      {pd.code} · {pd.name}
                    </span>
                    <span className="font-mono-num font-semibold text-[#065F46] shrink-0">
                      {pd.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* ADMIN USERS, ROLES & AUDIT LOGS (SUPER ADMIN ONLY) */}
      {/* ================================================================= */}
      {section === 'users' && currentRole === 'SUPER_ADMIN' && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateAdmin}
            className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-[#065F46]" />
              <h3 className="font-display text-sm font-bold text-[#111827]">
                Create Staff Admin Account (No Public Admin Registration)
              </h3>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <input
                type="text"
                value={newAdmName}
                onChange={(e) => setNewAdmName(e.target.value)}
                placeholder="Staff Name"
                required
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <input
                type="email"
                value={newAdmEmail}
                onChange={(e) => setNewAdmEmail(e.target.value)}
                placeholder="staff@daffodilvarsity.edu.bd"
                required
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <input
                type="password"
                value={newAdmPassword}
                onChange={(e) => setNewAdmPassword(e.target.value)}
                placeholder="Password (8+ chars)"
                minLength={8}
                required
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <select
                value={newAdmRole}
                onChange={(e) => setNewAdmRole(e.target.value as AdminRole)}
                className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
              >
                <option value="CONTENT_ADMIN">Content Admin</option>
                <option value="SUPPORT_ADMIN">Support Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            <button
              type="submit"
              className="rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
            >
              Create Admin User
            </button>
          </form>

          <div className="rounded-2xl border border-[#E4EAE6] bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E4EAE6]">
              <h3 className="font-display text-sm font-bold text-[#111827]">
                Registered Admin Accounts ({admins.length})
              </h3>
            </div>
            <div className="divide-y divide-[#E4EAE6]">
              {admins.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#111827]">{a.name}</p>
                    <p className="text-[#6B7280]">
                      {a.email} · {a.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAdminActive(a)}
                    className={`rounded-lg border px-2.5 py-1 font-medium ${
                      a.active
                        ? 'border-[#059669]/30 bg-[#059669]/8 text-[#064E3B]'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {a.active ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E4EAE6] bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E4EAE6]">
              <h3 className="font-display text-sm font-bold text-[#111827]">
                Security Audit Logs
              </h3>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-[#E4EAE6] text-xs">
              {auditLogs.length === 0 ? (
                <p className="p-5 text-[#6B7280]">No admin audit entries yet.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="px-5 py-2.5 flex flex-wrap justify-between gap-2">
                    <div>
                      <span className="font-mono-num font-semibold text-[#064E3B]">
                        {log.action}
                      </span>{' '}
                      <span className="text-[#374151]">{log.details}</span>
                      <span className="text-[#6B7280]"> · {log.adminEmail} ({log.role})</span>
                    </div>
                    <span className="font-mono-num text-[#6B7280]">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SETTINGS & EMBEDDABLE WIDGET CONFIGURATOR */}
      {/* ================================================================= */}
      {section === 'settings' && currentRole === 'SUPER_ADMIN' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-[#111827]">
              Official DIU Admission Contacts & Portal
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Admission Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Admission Email
                </label>
                <input
                  type="email"
                  value={admEmail}
                  onChange={(e) => setAdmEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Official Website URL
                </label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Official Application Portal URL
                </label>
                <input
                  type="url"
                  value={portalUrl}
                  onChange={(e) => setPortalUrl(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Campus Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-[#111827]">
              Embeddable Website Chat Widget Configurator
            </h3>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Primary Color
                </label>
                <input
                  type="color"
                  value={widgetColor}
                  onChange={(e) => setWidgetColor(e.target.value)}
                  className="h-9 w-full rounded-xl border border-[#D1D5DB] p-1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Accent Color
                </label>
                <input
                  type="color"
                  value={widgetAccent}
                  onChange={(e) => setWidgetAccent(e.target.value)}
                  className="h-9 w-full rounded-xl border border-[#D1D5DB] p-1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Default Language
                </label>
                <select
                  value={widgetLang}
                  onChange={(e) => setWidgetLang(e.target.value as Language)}
                  className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
                >
                  <option value="en">English</option>
                  <option value="bn">বাংলা</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Widget Position
                </label>
                <select
                  value={widgetPos}
                  onChange={(e) =>
                    setWidgetPos(e.target.value as 'bottom-right' | 'bottom-left')
                  }
                  className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Allowed Website Domains (comma-separated)
              </label>
              <input
                type="text"
                value={allowedDomains}
                onChange={(e) => setAllowedDomains(e.target.value)}
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs font-mono-num"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Welcome Message (English)
                </label>
                <textarea
                  rows={2}
                  value={widgetWelcomeEn}
                  onChange={(e) => setWidgetWelcomeEn(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Welcome Message (বাংলা)
                </label>
                <textarea
                  rows={2}
                  value={widgetWelcomeBn}
                  onChange={(e) => setWidgetWelcomeBn(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#E4EAE6] bg-[#F8FAF9] p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#111827]">
                  Public Embed Script (Zero API Keys Exposed)
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(embedSnippet);
                    setCopiedEmbed(true);
                    setTimeout(() => setCopiedEmbed(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#D1D5DB] bg-white px-2.5 py-1 text-xs font-medium text-[#374151]"
                >
                  {copiedEmbed ? <Check className="h-3 w-3 text-[#065F46]" /> : <Copy className="h-3 w-3" />}
                  {copiedEmbed ? 'Copied' : 'Copy Snippet'}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-[#111827] px-3 py-2 text-[11px] font-mono text-emerald-300">
                {embedSnippet}
              </pre>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
            >
              Save Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
