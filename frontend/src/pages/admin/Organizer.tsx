import { apiFetch, apiUrl } from "@/lib/api";
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Play, Square, QrCode, Download, GraduationCap, Users, CheckCircle2, Loader2 } from 'lucide-react';
import Layout from '@/layouts/AdminLayout';

interface Target {
  target_id: number;
  name: string;
  type: string;
  major_ids: number[];
}

interface TargetsData {
  targets: Target[];
}

interface StatusData {
  major: string;
  year: number;
  status: number;
  can_start: boolean;
  can_end: boolean;
  action_message?: string;
  qr_counts: {
    students: number;
    teachers: number;
  };
}

// Central place to map a numeric status to a label + color treatment,
// so the pill, the icon, and the copy never drift out of sync.
const STATUS_META: Record<number, { label: string; dot: string; pill: string }> = {
  0: { label: 'Not started', dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-700 border-slate-200' },
  1: { label: 'Voting open', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  2: { label: 'Finished', dot: 'bg-[hsl(265_70%_45%)]', pill: 'bg-[hsl(265_70%_97%)] text-[hsl(265_70%_35%)] border-[hsl(265_40%_88%)]' },
};

const statusMeta = (status: number | undefined) => STATUS_META[status ?? 0] ?? STATUS_META[0];

const Organizer: React.FC = () => {
  const [, setLocation] = useLocation();

  // State Management
  const [eventTarget, setEventTarget] = useState<Target | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<number | ''>('');
  const [festivalStatus, setFestivalStatus] = useState<StatusData | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // QR Form State
  const [studentsInput, setStudentsInput] = useState<string>('0');
  const [teachersInput, setTeachersInput] = useState<string>('0');
  const [qrMessage, setQrMessage] = useState<string>('');
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const qrInputsInitialized = useRef(false);

  const [festivalMessage, setFestivalMessage] = useState<string>('Generate QR codes, then start the event when you\'re ready.');
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // API Call: Load Organizer Targets
  const loadOrganizerTargets = async () => {
    try {
      const response = await apiFetch('/api/organizer/targets', { credentials: 'include' });
      const data: TargetsData = await response.json();

      if (!response.ok) {
        setFestivalMessage('Unable to load event options.');
        setIsLoadingStatus(false);
        return;
      }

      const target = data.targets?.[0] || null;
      setEventTarget(target);
      if (target) {
        setSelectedTargetId(target.target_id);
      } else {
        setFestivalMessage('No organizer event is assigned to this account.');
        setIsLoadingStatus(false);
      }
    } catch (err) {
      console.error('Error loading targets:', err);
      setFestivalMessage('Unable to load event options.');
      setIsLoadingStatus(false);
    }
  };

  // API Call: Refresh Status
  const refreshStatus = async (targetId: number) => {
    if (Number.isNaN(targetId)) return;
    try {
      const response = await apiFetch(`/api/organizer/status?target_id=${encodeURIComponent(targetId)}`, {
        credentials: 'include',
      });
      const data: StatusData = await response.json();

      if (!response.ok) {
        setFestivalMessage('Unable to load event status.');
        setIsLoadingStatus(false);
        return;
      }

      const parsedStatus = Number(data.status);
      const normalizedStatus = parsedStatus === 1 || parsedStatus === 2 ? parsedStatus : 0;
      const normalizedData = { ...data, status: normalizedStatus };
      setFestivalStatus(normalizedData);

      // Only seed the QR inputs with the live counts the first time we see
      // them — otherwise this would stomp on whatever the organizer is
      // actively typing every time the status polls.
      if (!qrInputsInitialized.current) {
        setStudentsInput(String(normalizedData.qr_counts?.students ?? 0));
        setTeachersInput(String(normalizedData.qr_counts?.teachers ?? 0));
        qrInputsInitialized.current = true;
      }

      if (normalizedData.action_message) {
        setFestivalMessage(normalizedData.action_message);
      } else if (normalizedStatus === 0) {
        setFestivalMessage('Voting has not started. Generate the required QR codes, then start the event when ready.');
      } else if (normalizedStatus === 1) {
        setFestivalMessage('Voting is currently open.');
      } else {
        setFestivalMessage('This event has finished. Winners have been finalized.');
      }
    } catch (err) {
      console.error('Error refreshing status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadOrganizerTargets();
  }, []);

  useEffect(() => {
    if (selectedTargetId !== '') {
      refreshStatus(Number(selectedTargetId));
    }
  }, [selectedTargetId]);

  // API Call: Start Event
  const handleStartFestival = async () => {
    if (selectedTargetId === '') return;
    setIsStarting(true);
    const form = new FormData();
    form.append('target_id', selectedTargetId.toString());

    try {
      const response = await apiFetch('/api/organizer/start', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok) {
        setFestivalMessage(data.detail || 'Event could not be started.');
        return;
      }

      setFestivalMessage(`${data.major} event started successfully. Voting is now open for ${data.year}.`);
      await refreshStatus(Number(selectedTargetId));
    } catch (err) {
      setFestivalMessage('Event could not be started.');
    } finally {
      setIsStarting(false);
    }
  };

  // API Call: Stop Event
  const handleStopFestival = async () => {
    if (selectedTargetId === '') return;
    setIsStopping(true);

    const form = new FormData();
    form.append('target_id', selectedTargetId.toString());

    try {
      const response = await apiFetch('/api/organizer/stop', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok) {
        setFestivalMessage(data.detail || 'Event could not be ended.');
        setIsStopping(false);
        setEndConfirmOpen(false);
        return;
      }

      setLocation(`/admin/results?target_id=${encodeURIComponent(selectedTargetId)}`);
    } catch (err) {
      setFestivalMessage('Event could not be ended.');
      setIsStopping(false);
      setEndConfirmOpen(false);
    }
  };

  // API Call: Generate QR Codes
  const handleGenerateQR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTargetId === '') return;
    setIsGeneratingQR(true);

    const form = new FormData();
    form.append('students', String(Math.max(0, Number(studentsInput || 0))));
    form.append('teachers', String(Math.max(0, Number(teachersInput || 0))));
    form.append('target_id', selectedTargetId.toString());

    try {
      const response = await apiFetch('/api/organizer/generate-qr', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok) {
        setQrMessage(data.detail || 'QR codes could not be generated.');
        return;
      }

      if (festivalStatus) {
        setFestivalStatus({
          ...festivalStatus,
          qr_counts: data.counts,
        });
      }
      setStudentsInput(String(data.counts.students));
      setTeachersInput(String(data.counts.teachers));

      const studentCreated = data.result?.students?.created_count || 0;
      const teacherCreated = data.result?.teachers?.created_count || 0;

      if (studentCreated === 0 && teacherCreated === 0) {
        setQrMessage('Already up to date — no new QR codes were needed.');
      } else {
        const parts = [];
        if (studentCreated > 0) parts.push(`${studentCreated} student`);
        if (teacherCreated > 0) parts.push(`${teacherCreated} teacher`);
        setQrMessage(`Created ${parts.join(' and ')} new QR code${studentCreated + teacherCreated === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      setQrMessage('QR codes could not be generated.');
    } finally {
      setIsGeneratingQR(false);
    }
  };

  // API Call: Download QR
  const handleDownloadQR = (role: 'student' | 'teacher') => {
    if (selectedTargetId === '') return;
    window.location.href = apiUrl(`/api/organizer/download-qr/${role}?target_id=${encodeURIComponent(selectedTargetId)}`);
  };

  const studentsCount = Number(festivalStatus?.qr_counts?.students || 0);
  const teachersCount = Number(festivalStatus?.qr_counts?.teachers || 0);
  const meta = statusMeta(festivalStatus?.status);

  const studentsTarget = Math.max(0, Number(studentsInput || 0));
  const teachersTarget = Math.max(0, Number(teachersInput || 0));
  const willCreateStudents = Math.max(0, studentsTarget - studentsCount);
  const willCreateTeachers = Math.max(0, teachersTarget - teachersCount);
  const willCreateAny = willCreateStudents > 0 || willCreateTeachers > 0;

  return (
    <Layout>
      {endConfirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900">End this event?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Voting closes immediately and can't be reopened. You'll pick each title recipient manually from the top 3 on the Results page.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEndConfirmOpen(false)}
                disabled={isStopping}
                className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStopFestival}
                disabled={isStopping}
                className="flex items-center gap-2 rounded-xl bg-red-800 px-4 py-2 font-semibold text-white disabled:opacity-60"
              >
                {isStopping && <Loader2 className="w-4 h-4 animate-spin" />}
                {isStopping ? 'Ending…' : 'End event'}
              </button>
            </div>
          </div>
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1120px] mx-auto p-5 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-[hsl(265_30%_15%)]">Organizer dashboard</h1>
        </div>

        {/* Event Selection & Control Panel */}
        <div className="bg-white border border-[hsl(265_10%_90%)] rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
              <h2 className="font-serif font-bold text-xl text-[hsl(265_30%_15%)]">
                {festivalStatus ? `${festivalStatus.major} Event — ${festivalStatus.year}` : '\u00A0'}
              </h2>

            {!isLoadingStatus && festivalStatus && (
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${meta.pill}`}>
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            )}
          </div>

          <div className="bg-[hsl(260_30%_99%)] p-4 rounded-xl text-sm text-[hsl(265_30%_20%)] border border-[hsl(265_10%_92%)] space-y-3">
            <p>{isLoadingStatus ? 'Loading event status…' : festivalMessage}</p>
            {Number(festivalStatus?.status) === 2 && selectedTargetId !== '' && (
              <button
                type="button"
                onClick={() => setLocation(`/admin/results?target_id=${encodeURIComponent(selectedTargetId)}`)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl green-bg text-white font-bold text-sm hover:opacity-80 transition-all"
              >
                View results
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            {festivalStatus?.can_start && (
              <button
                type="button"
                onClick={handleStartFestival}
                disabled={isStarting}
                className="flex items-center gap-2 px-6 py-3 rounded-xl green-bg text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-60"
              >
                {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {isStarting ? 'Starting…' : 'Start event'}
              </button>
            )}
            {festivalStatus?.can_end && (
              <button
                type="button"
                onClick={() => setEndConfirmOpen(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-800 text-white font-bold text-sm hover:opacity-90 transition-all"
              >
                <Square className="w-4 h-4" /> End event
              </button>
            )}
          </div>
        </div>

        {/* QR Codes Section */}
        <div className="bg-white border border-[hsl(265_10%_90%)] rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <h2 className="font-serif font-bold text-xl text-[hsl(265_30%_15%)] flex items-center gap-2">
              <QrCode className="w-5 h-5" /> QR codes
            </h2>
          </div>

          <form onSubmit={handleGenerateQR} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Students panel */}
              <div className="rounded-xl border border-[hsl(265_10%_88%)] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[hsl(265_30%_15%)]">
                  <GraduationCap className="w-4 h-4" /> Students
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-[hsl(265_30%_15%)]">{studentsCount}</span>
                  <span className="text-xs text-[hsl(265_10%_50%)]">code{studentsCount === 1 ? '' : 's'} generated</span>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[hsl(265_10%_50%)] mb-1.5">
                    Total needed
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="eg. 10"
                    value={studentsInput}
                    onChange={(e) => setStudentsInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[hsl(265_10%_88%)] bg-white text-sm outline-none focus:border-[hsl(265_70%_45%)]"
                    required
                  />
                  {willCreateStudents > 0 && (
                    <p className="mt-1.5 text-xs text-[hsl(265_70%_40%)]">Will create {willCreateStudents} new code{willCreateStudents === 1 ? '' : 's'}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadQR('student')}
                  disabled={studentsCount === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[hsl(265_10%_88%)] text-[hsl(265_30%_15%)] font-semibold text-sm hover:bg-[hsl(260_30%_99%)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" /> Download student codes
                </button>
              </div>

              {/* Teachers panel */}
              <div className="rounded-xl border border-[hsl(265_10%_88%)] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[hsl(265_30%_15%)]">
                  <Users className="w-4 h-4" /> Teachers
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-[hsl(265_30%_15%)]">{teachersCount}</span>
                  <span className="text-xs text-[hsl(265_10%_50%)]">code{teachersCount === 1 ? '' : 's'} generated</span>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[hsl(265_10%_50%)] mb-1.5">
                    Total needed
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="eg. 10"
                    value={teachersInput}
                    onChange={(e) => setTeachersInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[hsl(265_10%_88%)] bg-white text-sm outline-none focus:border-[hsl(265_70%_45%)]"
                    required
                  />
                  {willCreateTeachers > 0 && (
                    <p className="mt-1.5 text-xs text-[hsl(265_70%_40%)]">Will create {willCreateTeachers} new code{willCreateTeachers === 1 ? '' : 's'}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadQR('teacher')}
                  disabled={teachersCount === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[hsl(265_10%_88%)] text-[hsl(265_30%_15%)] font-semibold text-sm hover:bg-[hsl(260_30%_99%)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" /> Download teacher codes
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="submit"
                disabled={isGeneratingQR || !willCreateAny}
                className="flex items-center gap-2 px-6 py-3 rounded-xl green-bg text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingQR ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {isGeneratingQR ? 'Generating…' : 'Generate QR codes'}
              </button>
              {qrMessage && (
                <p className="text-sm text-[hsl(265_30%_25%)]">{qrMessage}</p>
              )}
            </div>
          </form>
        </div>
      </motion.div>
    </Layout>
  );
};

export default Organizer;