import { apiFetch, apiUrl } from "@/lib/api";
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Trash2,
  RefreshCw,
  Lock,
  Check,
  User,
  Edit2,
  Upload,
  Award,
  MoreVertical,
  X,
} from 'lucide-react';
import Layout from '@/layouts/AdminLayout';
import { motion } from 'framer-motion';

// --- ZOD SCHEMAS ---

const candidateFormSchema = z.object({
  c_name: z.string().min(1, 'Candidate name is required'),
  c_number: z.string().min(1, 'Candidate number is required'),
  c_gender: z.enum(['boy', 'girl']),
  c_photo: z.any().refine((files) => files && files.length > 0, 'Photo is required')
});

const editFormSchema = z.object({
  c_name: z.string().min(1, 'Candidate name is required'),
  c_number: z.string().min(1, 'Candidate number is required'),
  c_gender: z.enum(['boy', 'girl']).optional(),
  c_photo: z.any().optional()
});

const wholeEditFormSchema = z.object({
  c_w_number: z.string().min(1, 'Candidate number is required'),
  c_photo: z.any().optional()
});

const titleFormSchema = z.object({
  title: z.string().min(1, 'Title name is required'),
  group: z.enum(['boy', 'girl'])
});

type CandidateFormData = z.infer<typeof candidateFormSchema>;
type EditFormData = z.infer<typeof editFormSchema>;
type WholeEditFormData = z.infer<typeof wholeEditFormSchema>;
type TitleFormData = z.infer<typeof titleFormSchema>;

type AvailableMajor = {
  major_id: number;
  major: string;
};

type CombinedFestival = {
  combined_id: number;
  target_id: number;
  combined_name: string;
  major_ids: number[];
  majors: string[];
  status: number;
  editable: boolean;
};

type CombineRequest = {
  request_id: number;
  combined_name: string;
  request_type: 'create' | 'edit';
  status: 'pending' | 'accepted' | 'rejected';
  requester_admin_id: number;
  is_requester: boolean;
  member_major_ids: number[];
  majors: string[];
  my_response: 'pending' | 'accepted' | 'rejected' | null;
  rejection_message: string | null;
};

export default function AdminDashboard() {
  // Session & Identity States
  const [me, setMe] = useState<any>(null);
  const [candidateManagementLocked, setCandidateManagementLocked] = useState(false);
  const [candidateStatusMsg, setCandidateStatusMsg] = useState('Loading candidate management status...');
  
  // Data Lists & Editing States
  const [candidates, setCandidates] = useState<any[]>([]);
  const [editingCandidateId, setEditingCandidateId] = useState<number | null>(null);
  
  const [combinedFestivals, setCombinedFestivals] = useState<CombinedFestival[]>([]);
  const [combineRequests, setCombineRequests] = useState<CombineRequest[]>([]);
  const [combinedCandidates, setCombinedCandidates] = useState<any[]>([]);
  const [isCombineEditorOpen, setIsCombineEditorOpen] = useState(false);
  const [editingCombinedId, setEditingCombinedId] = useState<number | null>(null);
  const [availableMajors, setAvailableMajors] = useState<AvailableMajor[]>([]);
  const [selectedMajorIds, setSelectedMajorIds] = useState<number[]>([]);
  const [combinedName, setCombinedName] = useState('');

  const [titles, setTitles] = useState<any[]>([]);
  const [titlesLocked, setTitlesLocked] = useState(false);
  const [titleStatusMsg, setTitleStatusMsg] = useState('');

  const [wholeCandidates, setWholeCandidates] = useState<any[]>([]);
  const [editingWholeCandidateId, setEditingWholeCandidateId] = useState<number | null>(null);
  const [wholeReady, setWholeReady] = useState(true);
  const [wholeMissingMajors, setWholeMissingMajors] = useState<string[]>([]);
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [confirmRequest, setConfirmRequest] = useState<{message: string; onConfirm: () => void} | null>(null);
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [availableWholeCandidates, setAvailableWholeCandidates] = useState<any[]>([]);

  // React Hook Forms
  const candidateForm = useForm<CandidateFormData>({ resolver: zodResolver(candidateFormSchema) });
  const editCandidateForm = useForm<EditFormData>({ resolver: zodResolver(editFormSchema) });
  const wholeEditForm = useForm<WholeEditFormData>({ resolver: zodResolver(wholeEditFormSchema) });
  const titleForm = useForm<TitleFormData>({ resolver: zodResolver(titleFormSchema) });
  const selectedCandidatePhoto = candidateForm.watch('c_photo');
  const selectedCandidatePhotoFile = selectedCandidatePhoto?.[0] as File | undefined;

  // --- INITIALIZATION & SESSION RESTORE ---
  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const res = await apiFetch('/api/admin/me', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      applyAdminSession(data);
    } catch (err) {
      console.error(err);
    }
  };

  const applyAdminSession = (data: any) => {
    setMe(data);
    if (data.admin_role === 'major_admin') {
      loadCandidateManagementStatus().then(loadCandidates);
      loadCombinedFestivals();
      loadCombinedCandidates();
      loadTitles();
    } else if (data.admin_role === 'whole_admin') {
      loadWhole();
      loadAvailableWhole();
    }
  };

  // --- MAJOR ADMIN API CALLS ---

  const loadCandidateManagementStatus = async () => {
    const res = await apiFetch('/api/admin/candidate-management-status', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    setCandidateManagementLocked(Boolean(data.locked));
    setCandidateStatusMsg(data.message);
  };

  const loadCandidates = async () => {
    const res = await apiFetch('/api/admin/candidates', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
    setCandidates(rows);
  };

  const handleAddCandidate = async (formData: CandidateFormData) => {
    if (candidateManagementLocked) {
      setDashboardMessage('Candidate management is locked.');
      return;
    }
    const form = new FormData();
    form.append('c_name', formData.c_name);
    form.append('c_number', formData.c_number);
    form.append('c_gender', formData.c_gender);
    if (formData.c_photo?.[0]) {
      form.append('c_photo', formData.c_photo[0]);
    }

    const res = await apiFetch('/api/admin/candidates', {
      method: 'POST',
      body: form,
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) {
      setDashboardMessage(data.detail || 'Request could not be completed.');
      return;
    }
    candidateForm.reset();
    loadCandidates();
  };

  const startCandidateEdit = (id: number) => {
    if (candidateManagementLocked) {
      setDashboardMessage('Candidate management is locked.');
      return;
    }
    const candidate = candidates.find(item => item.c_id === id);
    if (!candidate) return;

    setEditingCandidateId(id);
    editCandidateForm.setValue('c_name', candidate.c_name);
    editCandidateForm.setValue('c_number', String(candidate.c_number));
  };

  const cancelCandidateEdit = () => {
    setEditingCandidateId(null);
    editCandidateForm.reset();
  };

  const handleUpdateCandidate = async (formData: EditFormData) => {
    if (editingCandidateId === null || candidateManagementLocked) return;

    const form = new FormData();
    form.append('c_name', formData.c_name);
    form.append('c_number', formData.c_number);
    if (formData.c_photo?.[0]) {
      form.append('c_photo', formData.c_photo[0]);
    }

    const res = await apiFetch(`/api/admin/candidates/${editingCandidateId}`, {
      method: 'PUT',
      body: form,
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) {
      setDashboardMessage(data.detail || 'Request could not be completed.');
      return;
    }

    cancelCandidateEdit();
    await loadCandidateManagementStatus();
    await loadCandidates();
  };

  const performDeleteCandidate = async (id: number) => {
    const res = await apiFetch(`/api/admin/candidates/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) { setDashboardMessage(data.detail || 'Request could not be completed.'); return; }
    await loadCandidateManagementStatus();
    await loadCandidates();
  };

  const deleteCandidate = (id: number) => {
    if (candidateManagementLocked) { setDashboardMessage('Candidate management is locked.'); return; }
    setConfirmRequest({ message: 'Delete this candidate? This action cannot be undone.', onConfirm: () => { setConfirmRequest(null); void performDeleteCandidate(id); } });
  };

  // --- COMBINE EVENTS LOGIC ---

  const loadCombinedFestivals = async () => {
    try {
      const res = await apiFetch('/api/admin/combine', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        setDashboardMessage(data.detail || 'Could not load combined-event information.');
        return;
      }
      setCombinedFestivals(Array.isArray(data.combined_festivals) ? data.combined_festivals : []);
      setCombineRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      console.error(err);
      setDashboardMessage('Could not load combined-event information.');
    }
  };

  const loadCombinedCandidates = async () => {
    try {
      const res = await apiFetch('/api/admin/combined-candidates', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        setDashboardMessage(data.detail || 'Could not load combined candidates.');
        return;
      }
      setCombinedCandidates(data.combined ? (data.candidates || []) : []);
    } catch (err) {
      console.error(err);
      setDashboardMessage('Could not load combined candidates.');
    }
  };

  const openCombineForm = async (combinedId: number | null = null) => {
    try {
      const res = await apiFetch('/api/admin/combine/available-majors', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        setDashboardMessage(data.detail || 'Request could not be completed.');
        return;
      }

      const current = combinedId === null
        ? null
        : combinedFestivals.find(item => item.combined_id === combinedId) || null;

      setEditingCombinedId(combinedId);
      setAvailableMajors(Array.isArray(data.available_majors) ? data.available_majors : []);
      setCombinedName(current?.combined_name || '');

      setSelectedMajorIds(
        current
          ? current.major_ids.filter(id => id !== me?.major_id)
          : []
      );
      setIsCombineEditorOpen(true);
    } catch (err) {
      console.error(err);
      setDashboardMessage('Could not load available majors.');
    }
  };

  const closeCombineForm = () => {
    setIsCombineEditorOpen(false);
    setEditingCombinedId(null);
    setAvailableMajors([]);
    setSelectedMajorIds([]);
    setCombinedName('');
  };

  const toggleCombinedMajor = (majorId: number) => {
    setSelectedMajorIds(current =>
      current.includes(majorId)
        ? current.filter(id => id !== majorId)
        : [...current, majorId]
    );
  };

  const handleSaveCombine = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = combinedName.trim();
    if (!name) {
      setDashboardMessage('Combined event name is required.');
      return;
    }
    if (selectedMajorIds.length < 1) {
      setDashboardMessage('Select at least one other major.');
      return;
    }

    const form = new FormData();
    form.append('combined_name', name);
    selectedMajorIds.forEach(id => form.append('major_ids', String(id)));

    const isEditing = editingCombinedId !== null;
    const url = isEditing ? `/api/admin/combine/${editingCombinedId}` : '/api/admin/combine';

    try {
      const res = await apiFetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        body: form,
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        setDashboardMessage(data.detail || 'Request could not be completed.');
        return;
      }

      closeCombineForm();
      await Promise.all([
        loadCombinedFestivals(),
        loadCandidateManagementStatus(),
      ]);
      setDashboardMessage(
        data.message ||
        (isEditing
          ? 'Combined event edit request sent. It will apply after all selected major admins accept.'
          : 'Combination request sent to the selected major admins.')
      );
    } catch (err) {
      console.error(err);
      setDashboardMessage('Could not send the combination request.');
    }
  };

  const respondCombine = async (requestId: number, responseType: 'accepted' | 'rejected') => {
    const form = new FormData();
    form.append('response', responseType);

    try {
      const res = await apiFetch(`/api/admin/combine/requests/${requestId}/response`, {
        method: 'PUT',
        body: form,
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        setDashboardMessage(data.detail || 'Request could not be completed.');
        return;
      }

      await Promise.all([
        loadCombinedFestivals(),
        loadCombinedCandidates(),
        loadCandidateManagementStatus(),
        loadCandidates(),
        loadTitles(),
      ]);

      if (data.status === 'pending') {
        setDashboardMessage(data.message || 'Your acceptance was saved. Waiting for the remaining major admins.');
      } else if (data.status === 'accepted') {
        setDashboardMessage('All selected majors accepted. The combined event is now active.');
      }
    } catch (err) {
      console.error(err);
      setDashboardMessage('Could not respond to the combination request.');
    }
  };

  const rejectCombine = (requestId: number) => {
    setRejectRequestId(requestId);
    setRejectReason('');
  };

  const submitCombineRejection = async () => {
    if (rejectRequestId === null) return;
    const form = new FormData();
    form.append('response', 'rejected');
    form.append('message', rejectReason.trim() || 'Combination request rejected.');

    try {
      const res = await apiFetch(`/api/admin/combine/requests/${rejectRequestId}/response`, {
        method: 'PUT',
        body: form,
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        setDashboardMessage(data.detail || 'Request could not be completed.');
        return;
      }

      setRejectRequestId(null);
      setRejectReason('');
      await Promise.all([
        loadCombinedFestivals(),
        loadCandidateManagementStatus(),
      ]);
      setDashboardMessage('Combination request rejected.');
    } catch (err) {
      console.error(err);
      setDashboardMessage('Could not reject the combination request.');
    }
  };

  // --- TITLES LOGIC ---

  const loadTitles = async () => {
    const res = await apiFetch('/api/admin/titles', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    setTitlesLocked(Boolean(data.locked));
    setTitleStatusMsg(data.locked ? 'Titles are locked because a event has already started or completed.' : 'Titles can be managed before events begin.');
    setTitles(data.titles || []);
  };

  const handleAddTitle = async (formData: TitleFormData) => {
    const form = new FormData();
    form.append('title', formData.title);
    form.append('group', formData.group);

    const res = await apiFetch('/api/admin/titles', {
      method: 'POST',
      body: form,
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) {
      setDashboardMessage(data.detail || 'Request could not be completed.');
      return;
    }
    titleForm.reset();
    await loadTitles();
  };

  const performDeleteTitle = async (titleId: number) => {
    const res = await apiFetch(`/api/admin/titles/${titleId}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) { setDashboardMessage(data.detail || 'Request could not be completed.'); return; }
    await loadTitles();
  };

  const deleteTitle = (titleId: number) => {
    setConfirmRequest({ message: 'Delete this title? This action cannot be undone.', onConfirm: () => { setConfirmRequest(null); void performDeleteTitle(titleId); } });
  };

  // --- WHOLE ADMIN LOGIC ---

  const loadWhole = async () => {
    const res = await apiFetch('/api/admin/whole-candidates', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) {
      setDashboardMessage(data.detail || 'Request could not be completed.');
      return;
    }
    if (!data.ready) {
      setWholeReady(false);
      setWholeMissingMajors(data.missing_majors || []);
      return;
    }
    setWholeReady(true);
    setWholeCandidates(data.candidates || []);
  };

  const loadAvailableWhole = async () => {
    const res = await apiFetch('/api/admin/whole-candidates/available', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok || !data.ready) return;
    setAvailableWholeCandidates(data.available_candidates || []);
  };

  const addWhole = async (id: number) => {
    const res = await apiFetch(`/api/admin/whole-candidates/${id}`, { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) setDashboardMessage(data.detail || 'Request could not be completed.');
    await loadWhole();
    await loadAvailableWhole();
  };

  const removeWhole = async (id: number) => {
    const res = await apiFetch(`/api/admin/whole-candidates/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) setDashboardMessage(data.detail || 'Request could not be completed.');
    await loadWhole();
    await loadAvailableWhole();
  };

  const startWholeCandidateEdit = (candidate: any) => {
    setEditingWholeCandidateId(candidate.c_id);
    wholeEditForm.reset({
      c_w_number: String(candidate.c_w_number),
      c_photo: undefined,
    });
  };

  const cancelWholeCandidateEdit = () => {
    setEditingWholeCandidateId(null);
    wholeEditForm.reset();
  };

  const handleUpdateWholeCandidate = async (formData: WholeEditFormData) => {
    if (editingWholeCandidateId === null) return;

    const form = new FormData();
    form.append('c_w_number', formData.c_w_number);
    if (formData.c_photo?.[0]) {
      form.append('c_photo', formData.c_photo[0]);
    }

    const res = await apiFetch(`/api/admin/whole-candidates/${editingWholeCandidateId}`, {
      method: 'PUT',
      body: form,
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) {
      setDashboardMessage(data.detail || 'Request could not be completed.');
      return;
    }

    cancelWholeCandidateEdit();
    await loadWhole();
    await loadAvailableWhole();
  };

  // --- RENDER VIEWS ---

  return (
    <Layout>
      {dashboardMessage && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Notice</h2>
            <p className="mt-2 text-sm text-slate-600">{dashboardMessage}</p>
            <div className="mt-6 flex justify-end"><button type="button" onClick={() => setDashboardMessage('')} className="rounded-xl bg-primary px-4 py-2 font-semibold text-white">OK</button></div>
          </div>
        </div>
      )}
      {editingWholeCandidateId !== null && (() => {
        const candidate = wholeCandidates.find(item => item.c_id === editingWholeCandidateId);
        if (!candidate) return null;

        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-lg rounded-[24px] bg-white p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#24a58c]">
                    Whole Candidate Management
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-[#182521]">
                    Edit Whole Candidate
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={cancelWholeCandidateEdit}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f6f4] text-[#6e7b77]"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="mt-5 flex items-center gap-4 rounded-2xl bg-[#f7faf8] p-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#e8f7f2]">
                  {candidate.c_photo ? (
                    <img
                      src={apiUrl(candidate.c_photo)}
                      alt={candidate.c_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User size={28} className="text-[#65ad9d]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[#293630]">{candidate.c_name}</p>
                  <p className="mt-1 text-xs text-[#7d8a85]">{candidate.belonging_major || candidate.major}</p>
                  <p className="mt-1 text-xs font-semibold text-[#4d615a]">Current Whole No. #{candidate.c_w_number}</p>
                </div>
              </div>

              <form
                onSubmit={wholeEditForm.handleSubmit(handleUpdateWholeCandidate)}
                className="mt-5 space-y-4"
              >
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[#56645f]">
                    Whole candidate number
                  </label>
                  <input
                    {...wholeEditForm.register('c_w_number')}
                    type="number"
                    min="1"
                    required
                    className="w-full rounded-xl border border-[#dce5e1] bg-[#fbfdfc] px-3.5 py-3 text-sm outline-none focus:border-[#2aae94] focus:ring-4 focus:ring-[#20aa91]/10"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[#56645f]">
                    Candidate photo
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#cbd9d4] bg-[#fbfdfc] px-3 py-3">
                    <Upload size={17} className="text-[#229c84]" />
                    <div>
                      <span className="block text-xs font-semibold text-[#596760]">Choose new photo</span>
                      <span className="mt-0.5 block text-[10px] text-[#8a9691]">Leave empty to keep the current photo</span>
                    </div>
                    <input
                      {...wholeEditForm.register('c_photo')}
                      type="file"
                      accept="image/*"
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="submit"
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl green-bg px-4 py-3 text-sm font-bold text-white transition active:scale-[.98]"
                  >
                    <Check size={16} />
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={cancelWholeCandidateEdit}
                    className="rounded-xl bg-[#f0f3f1] px-5 py-3 text-sm font-bold text-[#66736e]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      {isCombineEditorOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#24a58c]">
                  Combined Event
                </p>
                <h2 className="mt-1 text-xl font-bold text-[#182521]">
                  {editingCombinedId !== null ? 'Edit Combined Event' : 'Combine Majors'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-[#7f8c87]">
                  Your major ({me?.major || 'Your major'}) is included automatically. Every selected major admin must accept before the combination is created or changed.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCombineForm}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f6f4] text-[#6e7b77]"
                aria-label="Close combine-major form"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleSaveCombine} className="mt-5 space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[#56645f]">
                  Combined event name
                </label>
                <input
                  value={combinedName}
                  onChange={(e) => setCombinedName(e.target.value)}
                  placeholder="e.g. ME+Agri Fresher's Welcome"
                  className="w-full rounded-xl border border-[#dce5e1] bg-[#fbfdfc] px-3.5 py-3 text-sm outline-none transition placeholder:text-[#aab5b1] focus:border-[#2aae94] focus:bg-white focus:ring-4 focus:ring-[#20aa91]/10"
                />
              </div>

              <div>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#56645f]">
                      Select other majors
                    </label>
                    <p className="mt-0.5 text-[11px] text-[#8a9692]">
                      Only majors currently eligible for combination are shown.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#eef9f5] px-2.5 py-1 text-[10px] font-bold text-[#218f78]">
                    {selectedMajorIds.length} selected
                  </span>
                </div>

                {availableMajors.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#dce7e3] bg-[#fbfdfc] px-4 py-7 text-center text-xs text-[#7f8c87]">
                    No other majors are currently available to combine.
                  </div>
                ) : (
                  <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                    {availableMajors.map((major) => {
                      const checked = selectedMajorIds.includes(major.major_id);
                      return (
                        <label
                          key={major.major_id}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition ${
                            checked
                              ? 'border-[#7bcdbb] bg-[#effaf6]'
                              : 'border-[#e4ebe7] bg-[#fbfdfc] hover:bg-[#f6faf8]'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCombinedMajor(major.major_id)}
                              className="h-4 w-4 accent-[#238d77]"
                            />
                            <span className="truncate text-sm font-bold text-[#34423d]">
                              {major.major}
                            </span>
                          </div>
                          {checked && <Check size={16} className="shrink-0 text-[#238d77]" />}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-[#fff8e8] px-3.5 py-3 text-[11px] leading-relaxed text-[#8b6d31]">
                Candidate numbers must be unique across all selected majors. The backend checks this again when the final admin accepts.
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeCombineForm}
                  className="rounded-xl border border-[#dce5e1] px-4 py-2.5 text-sm font-bold text-[#64716c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!combinedName.trim() || selectedMajorIds.length === 0}
                  className="rounded-xl green-bg px-4 py-2.5 text-sm font-bold text-white transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {editingCombinedId !== null ? 'Send Edit Request' : 'Send Combination Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {rejectRequestId !== null && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Reject Combination Request?</h2>
            <p className="mt-2 text-sm text-slate-600">Add a reason for the other major admins. If left blank, a default rejection message will be used.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary"
              placeholder="Reason for rejection"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setRejectRequestId(null); setRejectReason(''); }} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={() => void submitCombineRejection()} className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}
      {confirmRequest && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Confirm Action</h2>
            <p className="mt-2 text-sm text-slate-600">{confirmRequest.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmRequest(null)} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={confirmRequest.onConfirm} className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen px-3 py-4 sm:px-5 sm:py-6"
      >
        <div className="mx-auto max-w-[1180px]">

          {/* =========================================================
              HEADER
          ========================================================= */}
          <div className="mb-5 sm:mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>

                <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[#182521] sm:text-[30px]">
                  Admin Dashboard
                </h1>

                {me && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-[#6d7b76]">
                      Welcome, {me.admin_name}
                    </span>

                    <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold text-[#238d77] shadow-sm ring-1 ring-black/[0.03]">
                      {me.admin_role === 'major_admin'
                        ? `Major: ${me.major || 'Unknown'}`
                        : 'The Whole Welcome Admin'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>


          {/* =========================================================
              MAJOR ADMIN UI
          ========================================================= */}
          {me && me.admin_role === 'major_admin' && (
            <div className="space-y-5">

              {/* =====================================================
                  COMBINE MAJORS
              ===================================================== */}
              <section className="rounded-[24px] bg-white p-4 shadow-[0_10px_35px_rgba(31,42,68,.07)] sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f7f2]">
                      <User size={19} className="text-[#219d84]" />
                    </div>
                    <div>
                      <h2 className="text-[18px] font-bold text-[#182521]">Combine Majors</h2>
                      <p className="mt-0.5 text-xs leading-relaxed text-[#87938f]">
                        Create a shared event with other eligible majors. All selected major admins must accept.
                      </p>
                    </div>
                  </div>

                  <div className="flex w-full gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => void loadCombinedFestivals()}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f0f5f3] px-3.5 py-2.5 text-xs font-bold text-[#52625b] sm:flex-none"
                    >
                      <RefreshCw size={14} />
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={() => void openCombineForm()}
                      disabled={
                        candidateManagementLocked ||
                        combinedFestivals.length > 0 ||
                        combineRequests.some(request => request.status === 'pending')
                      }
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl green-bg px-3.5 py-2.5 text-xs font-bold text-white transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                    >
                      <Plus size={15} />
                      New Combination
                    </button>
                  </div>
                </div>

                {candidateManagementLocked && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#fff2f0] px-3.5 py-3 text-xs leading-relaxed text-[#a33b32]">
                    <Lock size={15} className="mt-0.5 shrink-0" />
                    Combination changes are unavailable because your event has already started or completed.
                  </div>
                )}

                {!candidateManagementLocked && combinedFestivals.length === 0 && combineRequests.every(request => request.status !== 'pending') && (
                  <div className="mt-4 rounded-xl bg-[#f0faf6] px-3.5 py-3 text-xs leading-relaxed text-[#4d7669]">
                    Your major is not currently in a combined event. You can start a new combination request.
                  </div>
                )}

                {combinedFestivals.map((festival) => (
                  <div key={festival.combined_id} className="mt-4 rounded-[18px] border border-[#dfe9e5] bg-[#fbfdfc] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-bold text-[#27342f]">{festival.combined_name}</p>
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${
                            festival.editable
                              ? 'bg-[#eaf8f3] text-[#218f78]'
                              : 'bg-[#fff2f0] text-[#ad4b42]'
                          }`}>
                            {festival.editable ? 'Not started' : 'Locked'}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[#71807a]">
                          {festival.majors.filter(Boolean).join(' + ')}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void openCombineForm(festival.combined_id)}
                        disabled={
                          !festival.editable ||
                          combineRequests.some(request => request.status === 'pending')
                        }
                        className="flex items-center justify-center gap-2 rounded-xl border border-[#b9ddd3] bg-white px-3.5 py-2.5 text-xs font-bold text-[#238d77] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Edit2 size={14} />
                        Edit Members
                      </button>
                    </div>
                    {!festival.editable && (
                      <p className="mt-3 text-[11px] leading-relaxed text-[#8b7772]">
                        The backend does not allow a running or completed combined event to be edited.
                      </p>
                    )}
                  </div>
                ))}

                {combineRequests.length > 0 && (
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-[#34423d]">Combination Requests</h3>
                      <span className="text-[10px] font-semibold text-[#8b9793]">
                        {combineRequests.filter(request => request.status === 'pending').length} pending
                      </span>
                    </div>

                    <div className="space-y-2">
                      {combineRequests.map((request) => {
                        const canRespond =
                          request.status === 'pending' &&
                          !request.is_requester &&
                          request.my_response === 'pending';

                        return (
                          <div key={request.request_id} className="rounded-[16px] border border-[#e6ece9] bg-[#fbfdfc] p-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-bold text-[#2f3d38]">{request.combined_name}</p>
                                  <span className="rounded-full bg-[#eef3f1] px-2 py-0.5 text-[9px] font-bold uppercase text-[#687670]">
                                    {request.request_type}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                                    request.status === 'accepted'
                                      ? 'bg-[#eaf8f3] text-[#218f78]'
                                      : request.status === 'rejected'
                                        ? 'bg-[#fff0ee] text-[#bd4037]'
                                        : 'bg-[#fff7e5] text-[#a97827]'
                                  }`}>
                                    {request.status}
                                  </span>
                                </div>

                                <p className="mt-1.5 text-xs text-[#7b8984]">
                                  {request.majors.filter(Boolean).join(' + ')}
                                </p>

                                {request.status === 'pending' && request.is_requester && (
                                  <p className="mt-2 text-[11px] font-semibold text-[#8a743c]">
                                    You sent this request. Waiting for the other selected major admins.
                                  </p>
                                )}
                                {request.status === 'pending' && !request.is_requester && request.my_response === 'accepted' && (
                                  <p className="mt-2 text-[11px] font-semibold text-[#39836f]">
                                    You accepted. Waiting for the remaining major admins.
                                  </p>
                                )}
                                {request.status === 'rejected' && request.rejection_message && (
                                  <p className="mt-2 rounded-lg bg-[#fff3f1] px-3 py-2 text-[11px] leading-relaxed text-[#a0544b]">
                                    {request.rejection_message}
                                  </p>
                                )}
                              </div>

                              {canRespond && (
                                <div className="flex shrink-0 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void respondCombine(request.request_id, 'accepted')}
                                    className="flex items-center gap-1.5 rounded-xl bg-[#e8f8f2] px-3 py-2 text-xs font-bold text-[#15836c]"
                                  >
                                    <Check size={14} />
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => rejectCombine(request.request_id)}
                                    className="rounded-xl bg-[#fff0ee] px-3 py-2 text-xs font-bold text-[#bd4037]"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* =====================================================
                  CANDIDATE MANAGEMENT
                  DESKTOP = LEFT FORM + RIGHT CANDIDATES
                  MOBILE = FORM ABOVE CANDIDATES
              ===================================================== */}
              <div className="grid items-start gap-5 lg:grid-cols-[350px_1fr]">

                {/* ADD CANDIDATE */}
                <section className="rounded-[24px] bg-white p-4 shadow-[0_10px_35px_rgba(31,42,68,.07)] sm:p-5 lg:sticky lg:top-5">

                  <div className="mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5f8f2]">
                        <Plus size={19} className="text-[#20a88e]" />
                      </div>

                      <div>
                        <h2 className="text-[18px] font-bold text-[#182521]">
                          Add Candidate
                        </h2>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`mb-4 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                      candidateManagementLocked
                        ? 'bg-[#fff2f0] text-[#a33b32]'
                        : 'bg-[#f0faf6] text-[#4d7669]'
                    }`}
                  >
                    {candidateStatusMsg}
                  </div>

                  <form
                    onSubmit={candidateForm.handleSubmit(
                      handleAddCandidate
                    )}
                    className="space-y-3"
                  >
                    {/* Name */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-[#56645f]">
                        Name
                      </label>

                      <input
                        {...candidateForm.register('c_name')}
                        placeholder="Candidate name"
                        disabled={candidateManagementLocked}
                        className="w-full rounded-xl border border-[#dce5e1] bg-[#fbfdfc] px-3.5 py-3 text-sm outline-none transition placeholder:text-[#aab5b1] focus:border-[#2aae94] focus:bg-white focus:ring-4 focus:ring-[#20aa91]/10 disabled:cursor-not-allowed disabled:bg-[#f3f5f4]"
                      />

                      {candidateForm.formState.errors.c_name && (
                        <p className="mt-1 text-[11px] text-red-500">
                          {String(
                            candidateForm.formState.errors.c_name.message
                          )}
                        </p>
                      )}
                    </div>

                    {/* Number */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-[#56645f]">
                        Candidate number
                      </label>

                      <input
                        {...candidateForm.register('c_number')}
                        type="number"
                        min="1"
                        placeholder="e.g. 01"
                        disabled={candidateManagementLocked}
                        className="w-full rounded-xl border border-[#dce5e1] bg-[#fbfdfc] px-3.5 py-3 text-sm outline-none transition placeholder:text-[#aab5b1] focus:border-[#2aae94] focus:bg-white focus:ring-4 focus:ring-[#20aa91]/10 disabled:cursor-not-allowed disabled:bg-[#f3f5f4]"
                      />

                      {candidateForm.formState.errors.c_number && (
                        <p className="mt-1 text-[11px] text-red-500">
                          {String(
                            candidateForm.formState.errors.c_number.message
                          )}
                        </p>
                      )}
                    </div>

                    {/* Gender */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-[#56645f]">
                        Group
                      </label>

                      <select
                        {...candidateForm.register('c_gender')}
                        disabled={candidateManagementLocked}
                        className="w-full rounded-xl border border-[#dce5e1] bg-[#fbfdfc] px-3.5 py-3 text-sm outline-none transition focus:border-[#2aae94] focus:bg-white focus:ring-4 focus:ring-[#20aa91]/10 disabled:cursor-not-allowed disabled:bg-[#f3f5f4]"
                      >
                        <option value="boy">Boy</option>
                        <option value="girl">Girl</option>
                      </select>
                    </div>

                    {/* Photo */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-[#56645f]">
                        Candidate photo
                      </label>

                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#cbd9d4] bg-[#fbfdfc] px-3 py-3 ${
                          candidateManagementLocked
                            ? 'pointer-events-none opacity-50'
                            : 'hover:bg-[#f6faf8]'
                        }`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf8f4]">
                          <Upload
                            size={16}
                            className="text-[#229c84]"
                          />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[#4e5d57]">
                            {selectedCandidatePhotoFile?.name || 'Choose photo'}
                          </p>
                          <p className="text-[10px] text-[#97a39f]">
                            JPG, PNG or WEBP
                          </p>
                        </div>

                        <input
                          {...candidateForm.register('c_photo')}
                          type="file"
                          accept="image/*"
                          disabled={candidateManagementLocked}
                          className="hidden"
                        />
                      </label>

                      {selectedCandidatePhotoFile && (
                        <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card p-2">
                          <img
                            src={URL.createObjectURL(selectedCandidatePhotoFile)}
                            alt="Selected candidate preview"
                            className="h-28 w-full rounded-lg object-cover"
                            onLoad={(event) => URL.revokeObjectURL(event.currentTarget.src)}
                          />
                        </div>
                      )}

                      {candidateForm.formState.errors.c_photo && (
                        <p className="mt-1 text-[11px] text-red-500">
                          {String(
                            candidateForm.formState.errors.c_photo.message
                          )}
                        </p>
                      )}
                    </div>

                    <button
                      disabled={candidateManagementLocked}
                      className="flex w-full items-center justify-center gap-2 rounded-xl green-bg px-4 py-3 text-sm font-bold text-white shadow-[0_6px_16px_rgba(32,170,145,.18)] transition hover:bg-[#18977f] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Plus size={17} />
                      Add candidate
                    </button>
                  </form>
                </section>


                {/* CANDIDATES */}
                <section className="min-w-0 rounded-[24px] bg-white p-4 shadow-[0_10px_35px_rgba(31,42,68,.07)] sm:p-5">

                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[19px] font-bold text-[#182521]">
                        Your Candidates
                      </h2>

                      <p className="mt-0.5 text-xs text-[#87938f]">
                        {candidates.length}{' '}
                        {candidates.length === 1
                          ? 'candidate'
                          : 'candidates'}
                      </p>
                    </div>

                    <div className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[#eef9f5] px-3 text-xs font-bold text-[#218f78]">
                      {candidates.length}
                    </div>
                  </div>

                  {candidates.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-[#dce7e3] bg-[#fbfdfc] px-5 py-10 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf8f4]">
                        <User
                          size={22}
                          className="text-[#2ba18a]"
                        />
                      </div>

                      <p className="text-sm font-bold text-[#586660]">
                        No candidates yet
                      </p>

                      <p className="mt-1 text-xs text-[#8d9995]">
                        Add your first candidate using the form.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">

                      {candidates.map(candidate => (
                        <motion.div
                          key={candidate.c_id}
                          whileHover={{ y: -2 }}
                          className="relative flex h-[95px] items-center gap-3 rounded-[18px] border border-white bg-white p-2.5 shadow-[0_6px_18px_rgba(30,70,55,.06)]"
                        >

                          {/* PHOTO */}
                          <div className="h-[70px] w-[70px] shrink-0 overflow-hidden rounded-[14px] bg-[#edf5f1]">
                            {candidate.c_photo ? (
                              <img
                                src={apiUrl(candidate.c_photo)}
                                alt={candidate.c_name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[#a5b5af]">
                                <User size={24} />
                              </div>
                            )}
                          </div>

                          {/* INFORMATION */}
                          <div className="min-w-0 flex-1">

                            <p className="text-[11px] font-medium text-[#7d8985]">
                              No. {candidate.c_number} ·{' '}
                              {candidate.c_gender === 'boy' ? 'Boys' : 'Girls'}
                            </p>

                            <h3 className="mt-0.5 truncate text-[15px] font-bold text-[#26332f]">
                              {candidate.c_name}
                            </h3>

                            {/* EDIT BUTTON */}
                            {!candidateManagementLocked && (
                              <button
                                onClick={() => startCandidateEdit(candidate.c_id)}
                                className="mt-2 flex items-center gap-1.5 rounded-xl bg-[#e8f8f2] px-3 py-1.5 text-xs font-bold text-[#15836c] transition hover:bg-[#d9f3e9] active:scale-[.97]"
                              >
                                <Edit2 size={13} />
                                Edit
                              </button>
                            )}
                          </div>

                          {/* DELETE BUTTON */}
                          {!candidateManagementLocked && (
                            <button
                              onClick={() => deleteCandidate(candidate.c_id)}
                              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-[#e05b5b] hover:bg-[#fff0ed]"
                              aria-label="Delete candidate"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}

                        </motion.div>
                      ))}

                    </div>
                  )}
                </section>
              </div>

              {/* =====================================================
                  EDIT CANDIDATE
              ===================================================== */}
              {editingCandidateId !== null && (
                <section className="rounded-[24px] border border-[#dcece6] bg-white p-4 shadow-[0_10px_35px_rgba(31,42,68,.07)] sm:p-5">

                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#24a58c]">
                        Candidate Management
                      </p>

                      <h2 className="mt-1 text-xl font-bold text-[#182521]">
                        Edit Candidate
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={cancelCandidateEdit}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f6f4] text-[#6e7b77]"
                    >
                      <X size={17} />
                    </button>
                  </div>

                  <form
                    onSubmit={editCandidateForm.handleSubmit(
                      handleUpdateCandidate
                    )}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <input
                      {...editCandidateForm.register('c_name')}
                      placeholder="Name"
                      required
                      className="w-full rounded-xl border border-[#dce5e1] bg-[#fbfdfc] px-3.5 py-3 text-sm outline-none focus:border-[#2aae94] focus:ring-4 focus:ring-[#20aa91]/10"
                    />

                    <input
                      {...editCandidateForm.register('c_number')}
                      type="number"
                      min="1"
                      placeholder="Candidate number"
                      required
                      className="w-full rounded-xl border border-[#dce5e1] bg-[#fbfdfc] px-3.5 py-3 text-sm outline-none focus:border-[#2aae94] focus:ring-4 focus:ring-[#20aa91]/10"
                    />

                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#cbd9d4] bg-[#fbfdfc] px-3 py-3 sm:col-span-2">
                      <Upload
                        size={17}
                        className="text-[#229c84]"
                      />

                      <span className="text-xs font-semibold text-[#596760]">
                        Choose new photo
                      </span>

                      <input
                        {...editCandidateForm.register('c_photo')}
                        type="file"
                        accept="image/*"
                        className="hidden"
                      />
                    </label>

                    <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
                      <button
                        type="submit"
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl green-bg px-4 py-3 text-sm font-bold text-white transition active:scale-[.98]"
                      >
                        <Check size={16} />
                        Save Changes
                      </button>

                      <button
                        type="button"
                        className="rounded-xl bg-[#f0f3f1] px-5 py-3 text-sm font-bold text-[#66736e]"
                        onClick={cancelCandidateEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </section>
              )}


              {/* =====================================================
                  COMBINED CANDIDATES
              ===================================================== */}
              {combinedCandidates.length > 0 && (
                <section className="rounded-[24px] bg-white p-4 shadow-[0_10px_35px_rgba(31,42,68,.07)] sm:p-5">

                  <div className="mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff5dc]">
                        <User
                          size={19}
                          className="text-[#d39429]"
                        />
                      </div>

                      <div>
                        <h2 className="text-[18px] font-bold text-[#182521]">
                          Combined Candidates
                        </h2>

                        <p className="text-xs text-[#87938f]">
                          Candidates from your accepted combination
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {combinedCandidates.map(c => (
                      <div
                        key={c.c_id}
                        className="overflow-hidden rounded-[20px] border border-[#e8ece9] bg-[#fbfdfc]"
                      >
                        <div className="relative aspect-[1.55/1] overflow-hidden bg-[#edf2ef]">
                          {c.c_photo ? (
                            <img
                              src={apiUrl(c.c_photo)}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <User
                                size={36}
                                className="text-[#b2c0bb]"
                              />
                            </div>
                          )}

                          <div className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[#34423d] shadow-sm">
                            #{c.c_number}
                          </div>
                        </div>

                        <div className="p-3.5">
                          <p className="truncate text-sm font-bold text-[#27342f]">
                            {c.c_name}
                          </p>

                          <p className="mt-1 text-xs text-[#7f8c87]">
                            {c.major} — {c.c_gender}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}


              {/* =====================================================
                  TITLES
              ===================================================== */}
              <section className="rounded-[24px] bg-white p-4 shadow-[0_10px_35px_rgba(31,42,68,.07)] sm:p-5">

                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff1dc]">
                    <Award
                      size={19}
                      className="text-[#d28b22]"
                    />
                  </div>

                  <div>
                    <h2 className="text-[18px] font-bold text-[#182521]">
                      Titles
                    </h2>
                  </div>
                </div>

                <div
                  className={`mb-4 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                    titlesLocked
                      ? 'bg-[#fff5ed] text-[#a86c38]'
                      : 'bg-[#f0faf6] text-[#4d7669]'
                  }`}
                >
                  {titleStatusMsg}
                </div>

                {/* Add title */}
                <form
                  onSubmit={titleForm.handleSubmit(handleAddTitle)}
                  className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_auto]"
                >
                  <input
                    {...titleForm.register('title')}
                    placeholder="Title name"
                    disabled={titlesLocked}
                    className="w-full rounded-xl border border-[#dce5e1] bg-[#fbfdfc] px-3.5 py-3 text-sm outline-none placeholder:text-[#aab5b1] focus:border-[#2aae94] focus:ring-4 focus:ring-[#20aa91]/10 disabled:bg-[#f3f5f4]"
                  />

                  <select
                    {...titleForm.register('group')}
                    disabled={titlesLocked}
                    className="w-full rounded-xl border border-[#dce5e1] bg-[#fbfdfc] px-3.5 py-3 text-sm outline-none focus:border-[#2aae94] focus:ring-4 focus:ring-[#20aa91]/10 disabled:bg-[#f3f5f4]"
                  >
                    <option value="boy">Boy title</option>
                    <option value="girl">Girl title</option>
                  </select>

                  <button
                    disabled={titlesLocked}
                    className="flex items-center justify-center gap-2 rounded-xl green-bg px-4 py-3 text-sm font-bold text-white transition active:scale-[.98] disabled:opacity-45"
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </form>

                {/* Title list */}
                <div className="grid gap-2 sm:grid-cols-2">
                  {titles.map(t => (
                    <div
                      key={t.title_id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#e7ece9] bg-[#fbfdfc] px-3.5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#33413c]">
                          {t.title}
                        </p>

                        <span className="mt-1 inline-block rounded-full bg-[#eaf7f3] px-2 py-0.5 text-[9px] font-bold capitalize text-[#238f78]">
                          {t.group}
                        </span>
                      </div>

                      {!titlesLocked && (
                        <button
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff0ee] text-[#bd4037] transition hover:bg-[#ffe5e2]"
                          onClick={() => deleteTitle(t.title_id)}
                          aria-label="Delete title"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}


          {/* =========================================================
              WHOLE ADMIN UI
          ========================================================= */}
          {me && me.admin_role === 'whole_admin' && (
            <div className="space-y-5">

              {/* Whole candidates */}
              <section className="rounded-[24px] bg-white p-4 shadow-[0_10px_35px_rgba(31,42,68,.07)] sm:p-5">

                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f7f2]">
                        <Award
                          size={19}
                          className="text-[#219d84]"
                        />
                      </div>

                      <div>
                        <h2 className="text-[19px] font-bold text-[#182521]">
                          The Whole Welcome
                        </h2>

                        <p className="text-xs text-[#87938f]">
                          Manage the whole welcome candidates
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={loadWhole}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f0f5f3] px-4 py-3 text-xs font-bold text-[#52625b] transition hover:bg-[#e8eeeb] sm:w-auto"
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>

                {!wholeReady ? (
                  <div className="rounded-[18px] bg-[#fff4f1] p-4">
                    <p className="text-sm font-bold text-[#b3473e]">
                      Waiting for major data
                    </p>

                    <p className="mt-1 text-xs text-[#9c716c]">
                      {wholeMissingMajors.join(', ')}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {wholeCandidates.map(candidate => (
                      <div
                        key={candidate.c_id}
                        className="rounded-[20px] border border-[#e6ece9] bg-[#fbfdfc] p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#e8f7f2]">
                            {candidate.c_photo ? (
                              <img
                                src={apiUrl(candidate.c_photo)}
                                alt={candidate.c_name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <User size={24} className="text-[#65ad9d]" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-[#293630]">
                                  Whole No. #{candidate.c_w_number}
                                </p>
                                <p className="mt-1 truncate text-sm font-semibold text-[#46534e]">
                                  {candidate.c_name}
                                </p>
                                <p className="mt-1 text-xs text-[#7d8a85]">
                                  {candidate.belonging_major || candidate.major}
                                </p>
                              </div>

                              <span className="shrink-0 rounded-full bg-[#fff4dc] px-2.5 py-1 text-[9px] font-bold text-[#b47a27]">
                                Winner
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="mt-3 rounded-xl bg-white p-3 text-xs leading-relaxed text-[#687670]">
                          <span className="font-bold text-[#4b5954]">Awarded:</span>{' '}
                          {(candidate.awarded_titles || []).join(', ') || 'No title found'}
                        </p>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startWholeCandidateEdit(candidate)}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#edf7f4] px-3.5 py-2.5 text-xs font-bold text-[#218f78] transition hover:bg-[#e2f2ed]"
                          >
                            <Edit2 size={14} />
                            Edit
                          </button>

                          <button
                            type="button"
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#fff0ee] px-3.5 py-2.5 text-xs font-bold text-[#bd4037]"
                            onClick={() => setConfirmRequest({
                              message: 'Remove this candidate from the Whole Welcome?',
                              onConfirm: () => {
                                setConfirmRequest(null);
                                void removeWhole(candidate.c_id);
                              },
                            })}
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>


              {/* Available winners */}
              <section className="rounded-[24px] bg-white p-4 shadow-[0_10px_35px_rgba(31,42,68,.07)] sm:p-5">

                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-[19px] font-bold text-[#182521]">
                      Available Major Winners
                    </h2>

                    <p className="mt-1 text-xs text-[#87938f]">
                      Select winners for the whole welcome
                    </p>
                  </div>

                  <button
                    onClick={loadAvailableWhole}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f0f5f3] px-4 py-3 text-xs font-bold text-[#52625b] sm:w-auto"
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availableWholeCandidates.map(candidate => (
                    <div
                      key={candidate.c_id}
                      className="rounded-[20px] border border-[#e6ece9] bg-[#fbfdfc] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#293630]">
                            #{candidate.c_number}{' '}
                            {candidate.c_name}
                          </p>

                          <p className="mt-1 text-xs text-[#7d8a85]">
                            {candidate.belonging_major || candidate.major}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 text-xs leading-relaxed text-[#687670]">
                        <span className="font-bold text-[#4b5954]">
                          Awarded:
                        </span>{' '}
                        {(candidate.awarded_titles || []).join(
                          ', '
                        ) || 'No title found'}
                      </p>

                      {candidate.selected ? (
                        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#eaf8f3] px-3 py-2.5 text-xs font-bold text-[#218f78]">
                          <Check size={14} />
                          Added to Whole
                        </div>
                      ) : (
                        <button
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl green-bg px-3 py-2.5 text-xs font-bold text-white transition active:scale-[.98]"
                          onClick={() =>
                            addWhole(candidate.c_id)
                          }
                        >
                          <Plus size={15} />
                          Add to Whole
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

        </div>
      </motion.div>
    </Layout>
  );
}
