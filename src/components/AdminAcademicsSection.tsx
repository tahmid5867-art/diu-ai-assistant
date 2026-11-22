import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  Department,
  FaqItem,
  FeeStructure,
  KnowledgeCategory,
  Program,
  Scholarship,
  ScholarshipCategory,
  VerificationStatus,
} from '../types';
import { apiFetch } from '../utils/api';

interface AdminAcademicsSectionProps {
  mode: 'academics' | 'scholarships' | 'faqs';
  token: string;
  departments: Department[];
  programs: Program[];
  feeStructures: FeeStructure[];
  scholarships: Scholarship[];
  faqs: FaqItem[];
  onRefresh: () => Promise<void>;
}

export function AdminAcademicsSection({
  mode,
  token,
  departments,
  programs,
  feeStructures,
  scholarships,
  faqs,
  onRefresh,
}: AdminAcademicsSectionProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Add Department Form
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptFaculty, setDeptFaculty] = useState('');
  const [deptDesc, setDeptDesc] = useState('');

  // Add Program Form
  const [progDeptId, setProgDeptId] = useState(departments[0]?.id ?? '');
  const [progName, setProgName] = useState('');
  const [progDegree, setProgDegree] = useState('B.Sc.');
  const [progLevel, setProgLevel] = useState<'undergraduate' | 'postgraduate'>('undergraduate');
  const [progCredits, setProgCredits] = useState('140');
  const [progMinSsc, setProgMinSsc] = useState('3.0');
  const [progMinHsc, setProgMinHsc] = useState('3.0');

  // Add Fee Schedule Form
  const [feeProgramId, setFeeProgramId] = useState(programs[0]?.id ?? '');
  const [feeSem, setFeeSem] = useState('Fall 2026');
  const [feeAdm, setFeeAdm] = useState('20000');
  const [feeCredit, setFeeCredit] = useState('5500');
  const [feePerSem, setFeePerSem] = useState('14500');
  const [feeLab, setFeeLab] = useState('16000');
  const [feeVerStatus, setFeeVerStatus] = useState<VerificationStatus>('verified');

  // Scholarship Form
  const [schName, setSchName] = useState('');
  const [schCat, setSchCat] = useState<ScholarshipCategory>('Result-Based');
  const [schWaiverPct, setSchWaiverPct] = useState('25');
  const [schWaiverLabel, setSchWaiverLabel] = useState('');
  const [schConditions, setSchConditions] = useState('');
  const [schDeadline, setSchDeadline] = useState('Before class start');

  // FAQ Form
  const [faqCategory, setFaqCategory] = useState<KnowledgeCategory>('Admission');
  const [faqQEn, setFaqQEn] = useState('');
  const [faqQBn, setFaqQBn] = useState('');
  const [faqAEn, setFaqAEn] = useState('');
  const [faqABn, setFaqABn] = useState('');
  const [faqUrl, setFaqUrl] = useState('');

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/admin/departments', {
        method: 'POST',
        token,
        body: JSON.stringify({
          code: deptCode,
          name: deptName,
          faculty: deptFaculty,
          description: deptDesc,
          verificationStatus: 'verified',
        }),
      });
      setDeptCode('');
      setDeptName('');
      setDeptFaculty('');
      setDeptDesc('');
      setNotice('Department added.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department');
    } finally {
      setBusy(false);
    }
  };

  const handleAddProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/admin/programs', {
        method: 'POST',
        token,
        body: JSON.stringify({
          departmentId: progDeptId || departments[0]?.id,
          name: progName,
          degreeType: progDegree,
          level: progLevel,
          totalCredits: Number(progCredits) || 140,
          minSscGpa: Number(progMinSsc) || null,
          minHscGpa: Number(progMinHsc) || null,
          verificationStatus: 'verified',
        }),
      });
      setProgName('');
      setNotice('Program added.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create program');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/admin/fees', {
        method: 'POST',
        token,
        body: JSON.stringify({
          programId: feeProgramId || programs[0]?.id,
          effectiveSemester: feeSem,
          admissionFee: feeAdm === '' ? null : Number(feeAdm),
          perCreditFee: feeCredit === '' ? null : Number(feeCredit),
          semesterFee: feePerSem === '' ? null : Number(feePerSem),
          labAndOtherFee: feeLab === '' ? null : Number(feeLab),
          isCurrent: true,
          verificationStatus: feeVerStatus,
        }),
      });
      setNotice('Fee schedule saved and previous schedule archived to history.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save fee schedule');
    } finally {
      setBusy(false);
    }
  };

  const handleAddScholarship = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/admin/scholarships', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: schName,
          category: schCat,
          waiverPercentage: schWaiverPct ? Number(schWaiverPct) : null,
          waiverLabel: schWaiverLabel || `${schWaiverPct}% tuition waiver`,
          conditions: schConditions,
          deadline: schDeadline,
          verificationStatus: 'verified',
        }),
      });
      setSchName('');
      setSchWaiverLabel('');
      setSchConditions('');
      setNotice('Scholarship added.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scholarship');
    } finally {
      setBusy(false);
    }
  };

  const toggleScholarshipActive = async (s: Scholarship) => {
    await apiFetch(`/api/admin/scholarships/${s.id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    await onRefresh();
  };

  const handleAddFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/admin/faqs', {
        method: 'POST',
        token,
        body: JSON.stringify({
          category: faqCategory,
          questionEn: faqQEn,
          questionBn: faqQBn || faqQEn,
          answerEn: faqAEn,
          answerBn: faqABn || faqAEn,
          sourceUrl: faqUrl || undefined,
          verificationStatus: 'verified',
        }),
      });
      setFaqQEn('');
      setFaqQBn('');
      setFaqAEn('');
      setFaqABn('');
      setFaqUrl('');
      setNotice('Bilingual FAQ published.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create FAQ');
    } finally {
      setBusy(false);
    }
  };

  const toggleFaqPublish = async (f: FaqItem) => {
    await apiFetch(`/api/admin/faqs/${f.id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ isPublished: !f.isPublished }),
    });
    await onRefresh();
  };

  const deleteFaq = async (id: string) => {
    await apiFetch(`/api/admin/faqs/${id}`, { method: 'DELETE', token });
    await onRefresh();
  };

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

      {mode === 'academics' && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Add Department */}
            <form
              onSubmit={handleAddDepartment}
              className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-3"
            >
              <h3 className="font-display text-sm font-bold text-[#111827]">
                Add Department
              </h3>
              <div className="grid grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="Code (e.g. ARCH)"
                  required
                  className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Department Full Name"
                  required
                  className="col-span-2 rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
              </div>
              <input
                type="text"
                value={deptFaculty}
                onChange={(e) => setDeptFaculty(e.target.value)}
                placeholder="Faculty Name"
                required
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <textarea
                rows={2}
                value={deptDesc}
                onChange={(e) => setDeptDesc(e.target.value)}
                placeholder="Department overview..."
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
              >
                <Plus className="h-3.5 w-3.5" />
                Save Department
              </button>
            </form>

            {/* Add Program */}
            <form
              onSubmit={handleAddProgram}
              className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-3"
            >
              <h3 className="font-display text-sm font-bold text-[#111827]">
                Add Academic Program
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                <select
                  value={progDeptId}
                  onChange={(e) => setProgDeptId(e.target.value)}
                  className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
                <select
                  value={progLevel}
                  onChange={(e) =>
                    setProgLevel(e.target.value as 'undergraduate' | 'postgraduate')
                  }
                  className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
                >
                  <option value="undergraduate">Undergraduate</option>
                  <option value="postgraduate">Postgraduate</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={progName}
                  onChange={(e) => setProgName(e.target.value)}
                  placeholder="Program Name"
                  required
                  className="col-span-2 rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={progDegree}
                  onChange={(e) => setProgDegree(e.target.value)}
                  placeholder="Degree (B.Sc.)"
                  className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <input
                  type="number"
                  value={progCredits}
                  onChange={(e) => setProgCredits(e.target.value)}
                  placeholder="Credits"
                  className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs tabular-nums"
                />
                <input
                  type="number"
                  step="0.1"
                  value={progMinSsc}
                  onChange={(e) => setProgMinSsc(e.target.value)}
                  placeholder="Min SSC GPA"
                  className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs tabular-nums"
                />
                <input
                  type="number"
                  step="0.1"
                  value={progMinHsc}
                  onChange={(e) => setProgMinHsc(e.target.value)}
                  placeholder="Min HSC GPA"
                  className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs tabular-nums"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
              >
                <Plus className="h-3.5 w-3.5" />
                Save Program
              </button>
            </form>
          </div>

          {/* Update Fee Structure (Preserves Historical Records) */}
          <form
            onSubmit={handleSaveFee}
            className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-3"
          >
            <h3 className="font-display text-sm font-bold text-[#111827]">
              Update Program Fee Structure (Archives Previous Semester Automatically)
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={feeProgramId}
                onChange={(e) => setFeeProgramId(e.target.value)}
                className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={feeSem}
                onChange={(e) => setFeeSem(e.target.value)}
                placeholder="Effective Semester (e.g. Fall 2026)"
                required
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <select
                value={feeVerStatus}
                onChange={(e) => setFeeVerStatus(e.target.value as VerificationStatus)}
                className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
              >
                <option value="verified">Verified Schedule</option>
                <option value="pending_verification">Pending Verification</option>
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="block text-[11px] text-[#6B7280] mb-1">Admission Fee (BDT)</label>
                <input
                  type="number"
                  value={feeAdm}
                  onChange={(e) => setFeeAdm(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#6B7280] mb-1">Per-Credit Fee (BDT)</label>
                <input
                  type="number"
                  value={feeCredit}
                  onChange={(e) => setFeeCredit(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#6B7280] mb-1">Semester Fee (BDT)</label>
                <input
                  type="number"
                  value={feePerSem}
                  onChange={(e) => setFeePerSem(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#6B7280] mb-1">Lab & Other Fee (BDT)</label>
                <input
                  type="number"
                  value={feeLab}
                  onChange={(e) => setFeeLab(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs font-mono-num"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
            >
              Publish New Fee Schedule
            </button>
          </form>

          {/* Programs & Fee Records Table */}
          <div className="rounded-2xl border border-[#E4EAE6] bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E4EAE6] bg-[#F8FAF9] text-[#6B7280]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Program</th>
                  <th className="px-4 py-3 font-semibold">Credits</th>
                  <th className="px-4 py-3 font-semibold">Current Fee Schedule</th>
                  <th className="px-4 py-3 font-semibold">Per-Credit</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4EAE6]">
                {programs.map((p) => {
                  const fee = feeStructures.find((f) => f.programId === p.id && f.isCurrent);
                  return (
                    <tr key={p.id} className="hover:bg-[#F8FAF9]">
                      <td className="px-4 py-3 font-medium text-[#111827]">{p.name}</td>
                      <td className="px-4 py-3 font-mono-num">{p.totalCredits}</td>
                      <td className="px-4 py-3 text-[#4B5563]">{fee?.effectiveSemester ?? 'Unset'}</td>
                      <td className="px-4 py-3 font-mono-num">
                        {fee?.perCreditFee !== null && fee?.perCreditFee !== undefined
                          ? `${fee.perCreditFee.toLocaleString()} BDT`
                          : 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            fee?.verificationStatus === 'verified'
                              ? 'text-[#065F46] font-semibold'
                              : 'text-amber-700'
                          }
                        >
                          {fee?.verificationStatus === 'verified' ? 'Verified' : 'Pending Verification'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mode === 'scholarships' && (
        <>
          <form
            onSubmit={handleAddScholarship}
            className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-3"
          >
            <h3 className="font-display text-sm font-bold text-[#111827]">
              Add Scholarship / Waiver Policy
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="text"
                value={schName}
                onChange={(e) => setSchName(e.target.value)}
                placeholder="Scholarship Name"
                required
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <select
                value={schCat}
                onChange={(e) => setSchCat(e.target.value as ScholarshipCategory)}
                className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
              >
                <option value="Result-Based">Result-Based</option>
                <option value="Semester GPA-Based">Semester GPA-Based</option>
                <option value="Need-Based">Need-Based</option>
                <option value="Female Student Waiver">Female Student Waiver</option>
                <option value="Sports Scholarship">Sports Scholarship</option>
                <option value="Freedom Fighter">Freedom Fighter</option>
                <option value="Talent Hunt">Talent Hunt</option>
                <option value="Chairman Endowment Fund">Chairman Endowment Fund</option>
              </select>
              <input
                type="number"
                value={schWaiverPct}
                onChange={(e) => setSchWaiverPct(e.target.value)}
                placeholder="Waiver %"
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs tabular-nums"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="text"
                value={schWaiverLabel}
                onChange={(e) => setSchWaiverLabel(e.target.value)}
                placeholder="Waiver Summary Label"
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={schDeadline}
                onChange={(e) => setSchDeadline(e.target.value)}
                placeholder="Application Deadline"
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
            </div>
            <textarea
              rows={2}
              value={schConditions}
              onChange={(e) => setSchConditions(e.target.value)}
              placeholder="Eligibility conditions and renewal requirements..."
              className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
            >
              Add Scholarship
            </button>
          </form>

          <div className="space-y-2.5">
            {scholarships.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E4EAE6] bg-white px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-[#111827]">{s.name}</p>
                  <p className="text-xs text-[#6B7280]">
                    {s.category} · {s.waiverLabel} · Deadline: {s.deadline}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleScholarshipActive(s)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold border ${
                    s.isActive
                      ? 'border-[#059669]/30 bg-[#059669]/8 text-[#064E3B]'
                      : 'border-[#E4EAE6] bg-[#F3F6F4] text-[#6B7280]'
                  }`}
                >
                  {s.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === 'faqs' && (
        <>
          <form
            onSubmit={handleAddFaq}
            className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-3"
          >
            <h3 className="font-display text-sm font-bold text-[#111827]">
              Add Bilingual FAQ (English & বাংলা)
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={faqCategory}
                onChange={(e) => setFaqCategory(e.target.value as KnowledgeCategory)}
                className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
              >
                <option value="Admission">Admission</option>
                <option value="Tuition Fees">Tuition Fees</option>
                <option value="Scholarships">Scholarships</option>
                <option value="Academic Rules">Academic Rules</option>
                <option value="Other Information">Other Information</option>
              </select>
              <input
                type="url"
                value={faqUrl}
                onChange={(e) => setFaqUrl(e.target.value)}
                placeholder="Official Source URL (Optional)"
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={faqQEn}
                onChange={(e) => setFaqQEn(e.target.value)}
                placeholder="Question (English)"
                required
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={faqQBn}
                onChange={(e) => setFaqQBn(e.target.value)}
                placeholder="প্রশ্ন (বাংলা)"
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <textarea
                rows={3}
                value={faqAEn}
                onChange={(e) => setFaqAEn(e.target.value)}
                placeholder="Answer (English)"
                required
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
              <textarea
                rows={3}
                value={faqABn}
                onChange={(e) => setFaqABn(e.target.value)}
                placeholder="উত্তর (বাংলা)"
                className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
            >
              Publish FAQ
            </button>
          </form>

          <div className="space-y-2.5">
            {faqs.map((f) => (
              <div
                key={f.id}
                className="rounded-2xl border border-[#E4EAE6] bg-white p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#6B7280]">{f.category}</p>
                    <p className="font-display text-sm font-bold text-[#111827]">{f.questionEn}</p>
                    <p className="text-xs text-[#4B5563]">{f.questionBn}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleFaqPublish(f)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                        f.isPublished
                          ? 'border-[#059669]/30 bg-[#059669]/8 text-[#064E3B]'
                          : 'border-[#E4EAE6] text-[#6B7280]'
                      }`}
                    >
                      {f.isPublished ? 'Published' : 'Draft'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFaq(f.id)}
                      aria-label={`Delete FAQ ${f.questionEn}`}
                      className="rounded-lg border border-[#E4EAE6] p-1.5 text-[#6B7280] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[#374151]">{f.answerEn}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
