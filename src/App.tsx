import { useCallback, useEffect, useState } from 'react';
import type {
  Department,
  FeeStructure,
  Program,
  Scholarship,
  UniversitySettings,
} from './types';
import { apiFetch } from './utils/api';
import { StudentWorkspace } from './components/StudentWorkspace';
import { AdminDashboard } from './components/AdminDashboard';

export default function App() {
  const [view, setView] = useState<'student' | 'admin'>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('view=admin')) {
      return 'admin';
    }
    return 'student';
  });

  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [settings, setSettings] = useState<UniversitySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPublicData = useCallback(async () => {
    try {
      const data = await apiFetch<{
        departments: Department[];
        programs: Program[];
        feeStructures: FeeStructure[];
        scholarships: Scholarship[];
        settings: UniversitySettings;
      }>('/api/public/data');
      setDepartments(data.departments);
      setPrograms(data.programs);
      setFeeStructures(data.feeStructures);
      setScholarships(data.scholarships);
      setSettings(data.settings);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load DIU admission data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPublicData();
  }, [loadPublicData]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAF9] text-sm font-medium text-[#4B5563]">
        Loading DIU Admission Assistant...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAF9] p-6 text-center">
        <p className="font-display text-base font-bold text-[#111827]">
          Unable to Connect to DIU Admission Assistant Server
        </p>
        <p className="mt-1 text-xs text-[#6B7280]">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            loadPublicData();
          }}
          className="mt-4 rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#065F46]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (view === 'admin') {
    return (
      <AdminDashboard
        onBackToStudent={() => setView('student')}
        onPublicDataChanged={loadPublicData}
      />
    );
  }

  return (
    <StudentWorkspace
      departments={departments}
      programs={programs}
      feeStructures={feeStructures}
      scholarships={scholarships}
      settings={settings}
      onOpenAdmin={() => setView('admin')}
    />
  );
}
