import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Building2,
  Award,
  HelpCircle,
  MessageSquare,
  AlertCircle,
  BarChart3,
  Users,
  Settings,
  Bell,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import type {
  AdminNotification,
  AdminRole,
  AdminUser,
  AuditLog,
  ChatMessage,
  Conversation,
  Department,
  FaqItem,
  FeeStructure,
  KnowledgeDocument,
  Program,
  Scholarship,
  UnansweredQuestion,
  UniversitySettings,
} from '../types';
import { apiFetch } from '../utils/api';
import { BrandMark } from './BrandMark';
import { AdminKnowledgeSection } from './AdminKnowledgeSection';
import { AdminAcademicsSection } from './AdminAcademicsSection';
import {
  AdminMonitoringSection,
  type OverviewStats,
} from './AdminMonitoringSection';

type AdminNavTab =
  | 'overview'
  | 'knowledge'
  | 'academics'
  | 'scholarships'
  | 'faqs'
  | 'chats'
  | 'unanswered'
  | 'analytics'
  | 'users'
  | 'settings';

interface AdminDashboardProps {
  onBackToStudent: () => void;
  onPublicDataChanged: () => Promise<void>;
}

export function AdminDashboard({
  onBackToStudent,
  onPublicDataChanged,
}: AdminDashboardProps) {
  const [token, setToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Login / Bootstrap form state
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Dashboard layout & data state
  const [activeTab, setActiveTab] = useState<AdminNavTab>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [popularQuestions, setPopularQuestions] = useState<{ question: string; count: number }[]>([]);
  const [popularDepartments, setPopularDepartments] = useState<
    { code: string; name: string; count: number }[]
  >([]);
  const [dailySeries, setDailySeries] = useState<
    { date: string; total: number; en: number; bn: number }[]
  >([]);
  const [recentConvs, setRecentConvs] = useState<Conversation[]>([]);
  const [recentKb, setRecentKb] = useState<KnowledgeDocument[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [chatLogs, setChatLogs] = useState<{ conversation: Conversation; messages: ChatMessage[] }[]>([]);
  const [unanswered, setUnanswered] = useState<UnansweredQuestion[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<UniversitySettings | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ bootstrapRequired: boolean; admin: AdminUser | null }>(
          '/api/admin/auth/status'
        );
        setBootstrapRequired(res.bootstrapRequired);
        setAdminUser(res.admin);
      } catch {
        // ignore
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  const loadAllAdminData = useCallback(async () => {
    if (!token || !adminUser) return;
    const role = adminUser.role;

    const overviewRes = await apiFetch<{
      stats: OverviewStats;
      popularQuestions: { question: string; count: number }[];
      popularDepartments: { code: string; name: string; count: number }[];
      dailySeries: { date: string; total: number; en: number; bn: number }[];
      recentConversations: Conversation[];
      recentKnowledgeUpdates: KnowledgeDocument[];
      notifications: AdminNotification[];
    }>('/api/admin/overview', { token });

    setStats(overviewRes.stats);
    setPopularQuestions(overviewRes.popularQuestions);
    setPopularDepartments(overviewRes.popularDepartments);
    setDailySeries(overviewRes.dailySeries);
    setRecentConvs(overviewRes.recentConversations);
    setRecentKb(overviewRes.recentKnowledgeUpdates);
    setNotifications(overviewRes.notifications);

    if (role === 'SUPER_ADMIN' || role === 'CONTENT_ADMIN') {
      const [kbRes, acadRes, schRes, faqRes] = await Promise.all([
        apiFetch<{ documents: KnowledgeDocument[] }>('/api/admin/knowledge', { token }),
        apiFetch<{
          departments: Department[];
          programs: Program[];
          feeStructures: FeeStructure[];
        }>('/api/admin/academics', { token }),
        apiFetch<{ scholarships: Scholarship[] }>('/api/admin/scholarships', { token }),
        apiFetch<{ faqs: FaqItem[] }>('/api/admin/faqs', { token }),
      ]);
      setDocuments(kbRes.documents);
      setDepartments(acadRes.departments);
      setPrograms(acadRes.programs);
      setFeeStructures(acadRes.feeStructures);
      setScholarships(schRes.scholarships);
      setFaqs(faqRes.faqs);
    }

    if (role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN') {
      const [chatsRes, uqRes] = await Promise.all([
        apiFetch<{ items: { conversation: Conversation; messages: ChatMessage[] }[] }>(
          '/api/admin/chats',
          { token }
        ),
        apiFetch<{ questions: UnansweredQuestion[] }>('/api/admin/unanswered', { token }),
      ]);
      setChatLogs(chatsRes.items);
      setUnanswered(uqRes.questions);
    }

    if (role === 'SUPER_ADMIN') {
      const [usersRes, pubRes] = await Promise.all([
        apiFetch<{ admins: AdminUser[]; auditLogs: AuditLog[] }>('/api/admin/users', { token }),
        apiFetch<{ settings: UniversitySettings }>('/api/public/data'),
      ]);
      setAdmins(usersRes.admins);
      setAuditLogs(usersRes.auditLogs);
      setSettings(pubRes.settings);
    }

    await onPublicDataChanged();
  }, [token, adminUser, onPublicDataChanged]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await apiFetch<{ token: string; admin: AdminUser }>('/api/admin/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          name: loginName,
          email: loginEmail,
          password: loginPassword,
        }),
      });
      setToken(res.token);
      setAdminUser(res.admin);
      setBootstrapRequired(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to initialize Super Admin');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await apiFetch<{ token: string; admin: AdminUser }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });
      setToken(res.token);
      setAdminUser(res.admin);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Admin login failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const markNotificationsRead = async () => {
    if (!token) return;
    await apiFetch('/api/admin/notifications/read-all', { method: 'POST', token });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAF9] text-sm text-[#6B7280]">
        Loading DIU Admin Portal...
      </div>
    );
  }

  // Unauthenticated Admin Login or First-Run Super Admin Claim
  if (!token || !adminUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAF9] p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#E4EAE6] bg-white p-6 sm:p-8 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <BrandMark size="sm" />
            <button
              type="button"
              onClick={onBackToStudent}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#065F46] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Student Chat
            </button>
          </div>

          <div className="border-t border-[#E4EAE6] pt-4">
            <div className="flex items-center gap-2 text-[#064E3B] mb-1">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-semibold">
                {bootstrapRequired ? 'Initial Super Admin Setup' : 'Admin Staff Sign In'}
              </span>
            </div>
            <h1 className="font-display text-xl font-bold text-[#111827]">
              {bootstrapRequired
                ? 'Claim Super Admin Access'
                : 'DIU Admission Assistant Admin'}
            </h1>
            <p className="mt-1 text-xs text-[#6B7280] leading-relaxed">
              {bootstrapRequired
                ? 'No Super Admin password has been claimed yet. Set your initial Super Admin credentials below (this one-time setup locks immediately after completion).'
                : 'Sign in with an authorized Super Admin, Content Admin, or Support Admin account.'}
            </p>
          </div>

          {authError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {authError}
            </div>
          )}

          <form
            onSubmit={bootstrapRequired ? handleBootstrap : handleAdminLogin}
            className="space-y-3.5"
          >
            {bootstrapRequired && (
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  placeholder="DIU Admission Director"
                  required
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Admin Email
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="admin@daffodilvarsity.edu.bd"
                required
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Password {bootstrapRequired ? '(8+ characters)' : ''}
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                minLength={bootstrapRequired ? 8 : 1}
                required
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={authBusy}
              className="w-full rounded-xl bg-[#064E3B] py-2.5 text-sm font-semibold text-white hover:bg-[#065F46] disabled:opacity-60"
            >
              {authBusy
                ? 'Authenticating...'
                : bootstrapRequired
                  ? 'Initialize Super Admin'
                  : 'Sign In to Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: {
    id: AdminNavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    roles: AdminRole[];
  }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'CONTENT_ADMIN', 'SUPPORT_ADMIN'] },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen, roles: ['SUPER_ADMIN', 'CONTENT_ADMIN'] },
    { id: 'academics', label: 'Departments & Fees', icon: Building2, roles: ['SUPER_ADMIN', 'CONTENT_ADMIN'] },
    { id: 'scholarships', label: 'Scholarships', icon: Award, roles: ['SUPER_ADMIN', 'CONTENT_ADMIN'] },
    { id: 'faqs', label: 'FAQs', icon: HelpCircle, roles: ['SUPER_ADMIN', 'CONTENT_ADMIN'] },
    { id: 'chats', label: 'Chat Monitoring', icon: MessageSquare, roles: ['SUPER_ADMIN', 'SUPPORT_ADMIN'] },
    { id: 'unanswered', label: 'Unanswered Questions', icon: AlertCircle, roles: ['SUPER_ADMIN', 'SUPPORT_ADMIN'] },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['SUPER_ADMIN', 'SUPPORT_ADMIN'] },
    { id: 'users', label: 'Admin Users & Roles', icon: Users, roles: ['SUPER_ADMIN'] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN'] },
  ];

  const allowedNav = navItems.filter((n) => n.roles.includes(adminUser.role));
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F8FAF9] text-[#111827]">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Collapsible Admin Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[#E4EAE6] bg-white transition-all duration-200 lg:static ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${sidebarCollapsed ? 'w-[72px]' : 'w-[280px]'}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-[#E4EAE6]">
          <BrandMark size="sm" showTitle={!sidebarCollapsed} className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label="Toggle admin sidebar"
            className="hidden lg:inline-flex shrink-0 rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F6F4]"
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close mobile menu"
            className="lg:hidden rounded-lg p-1.5 text-[#6B7280]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5" aria-label="Admin sections">
          {allowedNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                title={item.label}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#064E3B] text-white font-semibold'
                    : 'text-[#374151] hover:bg-[#F3F6F4]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#E4EAE6] p-3 space-y-1.5">
          {!sidebarCollapsed && (
            <div className="px-2 py-1">
              <p className="truncate text-xs font-semibold text-[#111827]">{adminUser.name}</p>
              <p className="truncate text-[11px] text-[#6B7280]">{adminUser.role}</p>
            </div>
          )}
          <button
            type="button"
            onClick={onBackToStudent}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[#065F46] hover:bg-[#064E3B]/8"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>Student Chat</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setToken(null);
              setAdminUser(null);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[#6B7280] hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Admin Main Area */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between gap-4 border-b border-[#E4EAE6] bg-white px-5 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open admin menu"
              className="rounded-lg p-1.5 text-[#4B5563] hover:bg-[#F3F6F4] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display text-base font-bold text-[#111827] whitespace-nowrap">
              {allowedNav.find((n) => n.id === activeTab)?.label ?? 'Admin Dashboard'}
            </h1>
          </div>

          <div className="relative flex items-center gap-3">
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label="Toggle notifications"
              className="relative inline-flex items-center gap-1.5 rounded-xl border border-[#E4EAE6] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F3F6F4]"
            >
              <Bell className="h-3.5 w-3.5 text-[#065F46]" />
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="font-mono-num font-bold text-[#064E3B]">({unreadCount})</span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-[#E4EAE6] bg-white p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#E4EAE6] pb-2">
                  <span className="font-display text-xs font-bold text-[#111827]">
                    Admin Alerts
                  </span>
                  <button
                    type="button"
                    onClick={markNotificationsRead}
                    className="text-[11px] font-medium text-[#065F46] hover:underline"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-[#6B7280]">No alerts.</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-xl border p-2.5 text-xs ${
                          n.isRead ? 'border-[#E4EAE6] bg-white' : 'border-[#065F46]/25 bg-[#064E3B]/4'
                        }`}
                      >
                        <p className="font-semibold text-[#111827]">{n.title}</p>
                        <p className="text-[#4B5563] mt-0.5">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* OVERVIEW */}
            {activeTab === 'overview' && stats && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: 'Total Conversations', value: stats.totalConversations },
                    { label: "Today's Conversations", value: stats.todayConversations },
                    { label: 'Registered Students', value: stats.registeredStudents },
                    { label: 'Open Unanswered Questions', value: stats.openUnansweredQuestions },
                    {
                      label: 'Knowledge Base Documents',
                      value: `${stats.knowledgeDocuments} (${stats.indexedChunks} chunks)`,
                    },
                    {
                      label: 'Student Satisfaction',
                      value:
                        stats.satisfactionPct !== null
                          ? `${stats.satisfactionPct}% (${stats.ratedCount} ratings)`
                          : 'No ratings yet',
                    },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-2xl border border-[#E4EAE6] bg-white p-5"
                    >
                      <p className="text-xs text-[#6B7280]">{card.label}</p>
                      <p className="mt-1.5 font-display text-2xl font-bold text-[#111827] tabular-nums">
                        {card.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5">
                    <h2 className="font-display text-sm font-bold text-[#111827] mb-3">
                      Recent Conversations
                    </h2>
                    {recentConvs.length === 0 ? (
                      <p className="text-xs text-[#6B7280]">No student conversations yet.</p>
                    ) : (
                      <div className="divide-y divide-[#E4EAE6] text-xs">
                        {recentConvs.map((c) => (
                          <div key={c.id} className="py-2.5 flex justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#111827]">{c.title}</p>
                              <p className="text-[#6B7280]">{c.ownerLabel}</p>
                            </div>
                            <span className="font-mono-num text-[#6B7280] shrink-0">
                              {c.language.toUpperCase()} · {c.messageCount}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5">
                    <h2 className="font-display text-sm font-bold text-[#111827] mb-3">
                      Recent Knowledge Base Updates
                    </h2>
                    <div className="divide-y divide-[#E4EAE6] text-xs">
                      {recentKb.map((d) => (
                        <div key={d.id} className="py-2.5 flex justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#111827]">{d.title}</p>
                            <p className="text-[#6B7280]">
                              {d.category} · {d.effectiveSemester}
                            </p>
                          </div>
                          <span className="font-mono-num text-[#065F46] shrink-0">
                            {d.chunkCount} chunks
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#111827]">
                      System Integration Readiness
                    </p>
                    <p className="text-[#6B7280] mt-0.5">
                      Gemini RAG Engine: {stats.geminiConfigured ? 'Configured & Active' : 'GEMINI_API_KEY missing in Secrets'} ·
                      API Calls: {stats.apiMetrics.totalCalls} · Errors: {stats.apiMetrics.totalErrors}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'knowledge' && (
              <AdminKnowledgeSection
                token={token}
                documents={documents}
                onRefresh={loadAllAdminData}
              />
            )}

            {(activeTab === 'academics' ||
              activeTab === 'scholarships' ||
              activeTab === 'faqs') && (
              <AdminAcademicsSection
                mode={activeTab}
                token={token}
                departments={departments}
                programs={programs}
                feeStructures={feeStructures}
                scholarships={scholarships}
                faqs={faqs}
                onRefresh={loadAllAdminData}
              />
            )}

            {(activeTab === 'chats' ||
              activeTab === 'unanswered' ||
              activeTab === 'analytics' ||
              activeTab === 'users' ||
              activeTab === 'settings') && (
              <AdminMonitoringSection
                section={activeTab}
                token={token}
                currentRole={adminUser.role}
                chatLogs={chatLogs}
                unanswered={unanswered}
                stats={stats}
                popularQuestions={popularQuestions}
                popularDepartments={popularDepartments}
                dailySeries={dailySeries}
                admins={admins}
                auditLogs={auditLogs}
                settings={settings}
                onRefresh={loadAllAdminData}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
