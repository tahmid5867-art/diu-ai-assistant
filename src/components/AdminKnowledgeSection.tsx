import React, { useState } from 'react';
import {
  FileUp,
  Plus,
  RefreshCw,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Edit3,
} from 'lucide-react';
import type { KnowledgeCategory, KnowledgeDocument, VerificationStatus } from '../types';
import { apiFetch } from '../utils/api';

const CATEGORIES: KnowledgeCategory[] = [
  'Admission',
  'Eligibility',
  'Tuition Fees',
  'Scholarships',
  'Departments',
  'Academic Rules',
  'Student Handbook',
  'Admission Circulars',
  'FAQs',
  'Other Information',
];

interface AdminKnowledgeSectionProps {
  token: string;
  documents: KnowledgeDocument[];
  onRefresh: () => Promise<void>;
}

export function AdminKnowledgeSection({
  token,
  documents,
  onRefresh,
}: AdminKnowledgeSectionProps) {
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired'>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Manual Entry / Edit Modal State
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory>('Admission');
  const [effectiveSemester, setEffectiveSemester] = useState('Spring 2026');
  const [sourceUrl, setSourceUrl] = useState('');
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>('verified');
  const [content, setContent] = useState('');

  // PDF Upload State
  const [pdfFiles, setPdfFiles] = useState<FileList | null>(null);
  const [pdfCategory, setPdfCategory] = useState<KnowledgeCategory>('Admission Circulars');
  const [pdfSemester, setPdfSemester] = useState('Spring 2026');
  const [pdfSourceUrl, setPdfSourceUrl] = useState('');
  const [pdfVerification, setPdfVerification] =
    useState<VerificationStatus>('verified');

  const openCreateForm = () => {
    setEditingDoc(null);
    setTitle('');
    setCategory('Admission');
    setEffectiveSemester('Spring 2026');
    setSourceUrl('');
    setVerificationStatus('verified');
    setContent('');
    setShowManualForm(true);
  };

  const openEditForm = (doc: KnowledgeDocument) => {
    setEditingDoc(doc);
    setTitle(doc.title);
    setCategory(doc.category);
    setEffectiveSemester(doc.effectiveSemester);
    setSourceUrl(doc.sourceUrl ?? '');
    setVerificationStatus(doc.verificationStatus);
    setContent(doc.content);
    setShowManualForm(true);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (editingDoc) {
        await apiFetch(`/api/admin/knowledge/${editingDoc.id}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify({
            title,
            category,
            effectiveSemester,
            sourceUrl: sourceUrl || undefined,
            verificationStatus,
            content,
          }),
        });
        setNotice(`Updated & re-indexed "${title}".`);
      } else {
        await apiFetch('/api/admin/knowledge', {
          method: 'POST',
          token,
          body: JSON.stringify({
            title,
            category,
            effectiveSemester,
            sourceUrl: sourceUrl || undefined,
            verificationStatus,
            content,
          }),
        });
        setNotice(`Added & indexed "${title}".`);
      }
      setShowManualForm(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save document');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadPdfs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFiles || pdfFiles.length === 0) {
      setError('Select one or more PDF files first.');
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(pdfFiles).forEach((f) => fd.append('files', f));
      fd.append('category', pdfCategory);
      fd.append('effectiveSemester', pdfSemester);
      fd.append('verificationStatus', pdfVerification);
      if (pdfSourceUrl.trim()) fd.append('sourceUrl', pdfSourceUrl.trim());

      const res = await apiFetch<{ documents: KnowledgeDocument[] }>(
        '/api/admin/knowledge/upload-pdf',
        {
          method: 'POST',
          token,
          body: fd,
        }
      );
      setPdfFiles(null);
      setNotice(`Processed ${res.documents.length} PDF document(s) into the RAG knowledge index.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF upload failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleDocStatus = async (doc: KnowledgeDocument) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/knowledge/${doc.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: doc.status === 'active' ? 'expired' : 'active' }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setBusy(false);
    }
  };

  const reindexDoc = async (docId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/knowledge/${docId}/reindex`, { method: 'POST', token });
      setNotice('Document chunks & embeddings re-indexed.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-index failed');
    } finally {
      setBusy(false);
    }
  };

  const reindexAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ docs: number; chunks: number }>(
        '/api/admin/knowledge/reindex-all',
        { method: 'POST', token }
      );
      setNotice(`Re-indexed ${res.docs} documents (${res.chunks} chunks).`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk re-index failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteDoc = async (doc: KnowledgeDocument) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/knowledge/${doc.id}`, { method: 'DELETE', token });
      setNotice(`Deleted "${doc.title}".`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const visibleDocs = documents.filter((d) => {
    if (filterCategory !== 'ALL' && d.category !== filterCategory) return false;
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#111827]">
            RAG Knowledge Base Management
          </h2>
          <p className="text-xs text-[#6B7280]">
            Upload PDF circulars (with automatic text & OCR extraction), manage manual entries, and control active/expired semesters.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reindexAll}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2 text-xs font-semibold text-[#374151] hover:bg-[#F3F6F4] disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-index All Embeddings
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#064E3B] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Manual Entry
          </button>
        </div>
      </div>

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

      {/* Multi-PDF Upload Panel */}
      <form
        onSubmit={handleUploadPdfs}
        className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <FileUp className="h-4 w-4 text-[#065F46]" />
          <h3 className="font-display text-sm font-bold text-[#111827]">
            Upload Official DIU PDF Documents (Multi-File & Scanned OCR Supported)
          </h3>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label htmlFor="kb-pdf-files" className="block text-xs font-medium text-[#374151] mb-1">
              Select PDF File(s)
            </label>
            <input
              id="kb-pdf-files"
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => setPdfFiles(e.target.files)}
              className="w-full rounded-xl border border-[#D1D5DB] bg-[#F8FAF9] px-3 py-1.5 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#064E3B] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
            />
          </div>
          <div>
            <label htmlFor="kb-pdf-cat" className="block text-xs font-medium text-[#374151] mb-1">
              Category
            </label>
            <select
              id="kb-pdf-cat"
              value={pdfCategory}
              onChange={(e) => setPdfCategory(e.target.value as KnowledgeCategory)}
              className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="kb-pdf-sem" className="block text-xs font-medium text-[#374151] mb-1">
              Effective Semester
            </label>
            <input
              id="kb-pdf-sem"
              type="text"
              value={pdfSemester}
              onChange={(e) => setPdfSemester(e.target.value)}
              className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4 items-end">
          <div className="md:col-span-2">
            <label htmlFor="kb-pdf-url" className="block text-xs font-medium text-[#374151] mb-1">
              Official Source URL (Optional)
            </label>
            <input
              id="kb-pdf-url"
              type="url"
              value={pdfSourceUrl}
              onChange={(e) => setPdfSourceUrl(e.target.value)}
              placeholder="https://daffodilvarsity.edu.bd/..."
              className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label htmlFor="kb-pdf-ver" className="block text-xs font-medium text-[#374151] mb-1">
              Verification Status
            </label>
            <select
              id="kb-pdf-ver"
              value={pdfVerification}
              onChange={(e) => setPdfVerification(e.target.value as VerificationStatus)}
              className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-xs"
            >
              <option value="verified">Verified</option>
              <option value="pending_verification">Pending Verification</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy || !pdfFiles?.length}
            className="rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46] disabled:opacity-50"
          >
            {busy ? 'Processing...' : 'Upload & Index PDF'}
          </button>
        </div>
      </form>

      {/* Manual Entry / Edit Modal */}
      {showManualForm && (
        <form
          onSubmit={handleSaveManual}
          className="rounded-2xl border border-[#065F46]/40 bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#E4EAE6] pb-3">
            <h3 className="font-display text-sm font-bold text-[#111827]">
              {editingDoc ? `Edit Document: ${editingDoc.title}` : 'New Manual Knowledge Entry'}
            </h3>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="text-xs text-[#6B7280] hover:text-[#111827]"
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Document Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
                className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Effective Semester
              </label>
              <input
                type="text"
                value={effectiveSemester}
                onChange={(e) => setEffectiveSemester(e.target.value)}
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Verification Status
              </label>
              <select
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value as VerificationStatus)}
                className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm"
              >
                <option value="verified">Verified</option>
                <option value="pending_verification">Pending Verification</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Official Source URL (Optional)
              </label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://daffodilvarsity.edu.bd/..."
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#374151] mb-1">
                Knowledge Content (Bengali or English)
              </label>
              <textarea
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="rounded-xl border border-[#D1D5DB] px-4 py-2 text-xs font-medium text-[#374151]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
            >
              {busy ? 'Saving...' : 'Save & Index Chunks'}
            </button>
          </div>
        </form>
      )}

      {/* Filters & Document Table */}
      <div className="rounded-2xl border border-[#E4EAE6] bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4EAE6] px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs"
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="flex rounded-xl bg-[#F3F6F4] p-0.5">
              {(['all', 'active', 'expired'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize ${
                    filterStatus === st ? 'bg-white text-[#111827] shadow-xs' : 'text-[#6B7280]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-[#6B7280] tabular-nums">
            Showing {visibleDocs.length} of {documents.length} documents
          </p>
        </div>

        <div className="divide-y divide-[#E4EAE6]">
          {visibleDocs.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 hover:bg-[#F8FAF9]"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-sm font-semibold text-[#111827]">{doc.title}</p>
                  {doc.sourceUrl && (
                    <a
                      href={doc.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-xs text-[#065F46] hover:underline"
                    >
                      Source <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#6B7280]">
                  <span>{doc.category}</span>
                  <span>·</span>
                  <span>{doc.effectiveSemester}</span>
                  <span>·</span>
                  <span className="font-mono-num">{doc.chunkCount} chunks</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    {doc.verificationStatus === 'verified' ? (
                      <CheckCircle2 className="h-3 w-3 text-[#065F46]" />
                    ) : (
                      <Clock className="h-3 w-3 text-amber-600" />
                    )}
                    {doc.verificationStatus === 'verified' ? 'Verified' : 'Pending Verification'}
                  </span>
                  <span>·</span>
                  <span className={doc.status === 'active' ? 'text-[#065F46] font-medium' : 'text-red-600'}>
                    {doc.status === 'active' ? 'Active' : 'Expired'}
                  </span>
                  {doc.processingStatus === 'failed' && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                        <AlertCircle className="h-3 w-3" />
                        Failed: {doc.processingError}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditForm(doc)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#E4EAE6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F3F6F4]"
                >
                  <Edit3 className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => reindexDoc(doc.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#E4EAE6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F3F6F4]"
                >
                  <RefreshCw className="h-3 w-3" />
                  Re-index
                </button>
                <button
                  type="button"
                  onClick={() => toggleDocStatus(doc)}
                  className="rounded-lg border border-[#E4EAE6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F3F6F4]"
                >
                  {doc.status === 'active' ? 'Mark Expired' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteDoc(doc)}
                  aria-label={`Delete ${doc.title}`}
                  className="rounded-lg border border-[#E4EAE6] bg-white p-1.5 text-[#6B7280] hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
