import React, { useState } from 'react';
import { X, UserCheck, LogOut, KeyRound, Mail, User, Phone } from 'lucide-react';
import type { Language, Program, StudentUser } from '../types';
import { apiFetch } from '../utils/api';

interface StudentAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentUser | null;
  token: string | null;
  language: Language;
  programs: Program[];
  onAuthenticated: (student: StudentUser, token: string) => void;
  onProfileUpdated: (student: StudentUser) => void;
  onLogout: () => void;
}

export function StudentAuthModal({
  isOpen,
  onClose,
  student,
  token,
  language,
  programs,
  onAuthenticated,
  onProfileUpdated,
  onLogout,
}: StudentAuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState(student?.name ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(student?.phone ?? '');
  const [interestedProgram, setInterestedProgram] = useState(student?.interestedProgram ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token?: string; student?: StudentUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (!res?.token || !res?.student?.id) {
        throw new Error('Incomplete login response from server.');
      }
      onAuthenticated(res.student, res.token);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token?: string; student?: StudentUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          phone,
          preferredLanguage: language,
        }),
      });
      if (!res?.token || !res?.student?.id) {
        throw new Error('Incomplete registration response from server.');
      }
      onAuthenticated(res.student, res.token);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfo(res?.message ?? 'Request processed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ student?: StudentUser }>('/api/auth/profile', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          name: name || student?.name,
          phone,
          interestedProgram,
          preferredLanguage: language,
          currentPassword: newPassword ? currentPassword : undefined,
          newPassword: newPassword || undefined,
        }),
      });
      if (!res?.student?.id) {
        throw new Error('Incomplete profile response from server.');
      }
      onProfileUpdated(res.student);
      setCurrentPassword('');
      setNewPassword('');
      setInfo('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Student Account"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#E4EAE6] bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E4EAE6] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#064E3B]/10 text-[#064E3B]">
              <UserCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-[#111827]">
                {student ? 'Student Profile' : 'Student Account'}
              </h2>
              <p className="text-xs text-[#6B7280]">
                {student
                  ? student.email
                  : 'Save your DIU admission chats across sessions'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close student account modal"
            className="rounded-lg p-2 text-[#6B7280] hover:bg-[#F3F6F4] hover:text-[#111827]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="mt-4 rounded-xl border border-[#059669]/30 bg-[#059669]/8 px-3.5 py-2.5 text-xs text-[#064E3B]">
            {info}
          </div>
        )}

        {student ? (
          <form onSubmit={handleUpdateProfile} className="mt-4 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Full Name</label>
              <input
                type="text"
                value={name || student.name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+8801XXXXXXXXX"
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Interested Program
              </label>
              <select
                value={interestedProgram}
                onChange={(e) => setInterestedProgram(e.target.value)}
                className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
              >
                <option value="">Select a DIU program</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-[#E4EAE6] pt-3">
              <p className="text-xs font-medium text-[#374151] mb-2">Change Password (Optional)</p>
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs focus:border-[#065F46] focus:outline-none"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (6+ chars)"
                  className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs focus:border-[#065F46] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4EAE6] px-3.5 py-2 text-xs font-medium text-[#4B5563] hover:bg-[#F3F6F4]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46] disabled:opacity-60"
              >
                {loading ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4">
            <div className="flex gap-1 rounded-xl bg-[#F3F6F4] p-1">
              {(['login', 'register', 'reset'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError(null);
                    setInfo(null);
                  }}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    mode === m
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  {m === 'login' ? 'Sign In' : m === 'register' ? 'Register' : 'Reset'}
                </button>
              ))}
            </div>

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Email</label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-[#9CA3AF] absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@example.com"
                      className="w-full rounded-xl border border-[#D1D5DB] pl-9 pr-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Password</label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 text-[#9CA3AF] absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-[#D1D5DB] pl-9 pr-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-[#064E3B] py-2.5 text-sm font-semibold text-white hover:bg-[#065F46] disabled:opacity-60"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Full Name</label>
                  <div className="relative">
                    <User className="h-4 w-4 text-[#9CA3AF] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full rounded-xl border border-[#D1D5DB] pl-9 pr-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Email</label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-[#9CA3AF] absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@example.com"
                      className="w-full rounded-xl border border-[#D1D5DB] pl-9 pr-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Phone (Optional)</label>
                  <div className="relative">
                    <Phone className="h-4 w-4 text-[#9CA3AF] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+8801XXXXXXXXX"
                      className="w-full rounded-xl border border-[#D1D5DB] pl-9 pr-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Password</label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 text-[#9CA3AF] absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full rounded-xl border border-[#D1D5DB] pl-9 pr-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-[#064E3B] py-2.5 text-sm font-semibold text-white hover:bg-[#065F46] disabled:opacity-60"
                >
                  {loading ? 'Creating account...' : 'Create Student Account'}
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleForgotPassword} className="mt-4 space-y-3">
                <p className="text-xs text-[#6B7280] leading-relaxed">
                  Enter your registered email address to request a password reset notification.
                </p>
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-[#064E3B] py-2.5 text-sm font-semibold text-white hover:bg-[#065F46] disabled:opacity-60"
                >
                  {loading ? 'Checking...' : 'Request Password Reset'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
