import { apiFetch } from "@/lib/api";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Crown, RefreshCw, Trophy } from "lucide-react";
import { motion } from "framer-motion";

interface RankedCandidate {
  c_id: number;
  c_number: number;
  c_name: string;
  total_vote_weight: number;
}

interface ResultTitle {
  title_id: number;
  title: string;
  total_vote_weight: number;
  winners: RankedCandidate[];
}

interface ResultsResponse {
  titles?: ResultTitle[];
  finalized?: boolean;
  source?: string;
  status?: number;
  detail?: string;
}

const MEDALS = [
  { label: "1st", ring: "ring-amber-300", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-400" },
  { label: "2nd", ring: "ring-slate-300", chip: "bg-slate-100 text-slate-600", bar: "bg-slate-400" },
  { label: "3rd", ring: "ring-rose-300", chip: "bg-rose-100 text-rose-700", bar: "bg-rose-400" },
];

const Results: React.FC = () => {
  const [, setLocation] = useLocation();
  const targetIdParam = new URLSearchParams(window.location.search).get("target_id");
  const targetId = targetIdParam ? Number(targetIdParam) : null;

  const [titles, setTitles] = useState<ResultTitle[]>([]);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [finalized, setFinalized] = useState(false);
  const [festivalStatus, setFestivalStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    if (targetId === null || Number.isNaN(targetId)) {
      setError("Missing target ID.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/api/organizer/winners?target_id=${encodeURIComponent(targetId)}`,
        { credentials: "include" }
      );
      const data: ResultsResponse = await response.json();
      if (!response.ok) {
        setError(data.detail || "Unable to load results.");
        setTitles([]);
        return;
      }

      const nextTitles = data.titles || [];
      setTitles(nextTitles);
      setFinalized(Boolean(data.finalized));
      setFestivalStatus(typeof data.status === "number" ? data.status : null);

      const defaults: Record<number, number> = {};
      const usedCandidateIds = new Set<number>();
      nextTitles.forEach((title) => {
        const defaultCandidate = title.winners?.find(
          (candidate) => !usedCandidateIds.has(candidate.c_id)
        );
        if (defaultCandidate) {
          defaults[title.title_id] = defaultCandidate.c_id;
          usedCandidateIds.add(defaultCandidate.c_id);
        }
      });
      setSelected(defaults);
    } catch {
      setError("Network error while loading results.");
      setTitles([]);
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const selectedCount = useMemo(
    () => titles.filter((title) => Boolean(selected[title.title_id])).length,
    [selected, titles]
  );

  const hasDuplicates = useMemo(() => {
    const candidateIds = titles.map((title) => selected[title.title_id]).filter(Boolean);
    return new Set(candidateIds).size !== candidateIds.length;
  }, [selected, titles]);

  const allSelected = useMemo(() => {
    if (titles.length === 0 || selectedCount !== titles.length) return false;
    return !hasDuplicates;
  }, [hasDuplicates, selectedCount, titles.length]);

  const candidateSelectedForAnotherTitle = (candidateId: number, titleId: number) =>
    Object.entries(selected).some(
      ([selectedTitleId, selectedCandidateId]) =>
        Number(selectedTitleId) !== titleId && selectedCandidateId === candidateId
    );

  // Allow temporary duplicate selections so the admin can swap candidates
  // between titles. Final submission stays disabled until every title has a
  // unique recipient, matching the backend one-title-per-candidate rule.
  const updateSelection = (titleId: number, candidateId: number) => {
    setSelected((prev) => ({ ...prev, [titleId]: candidateId }));
  };

  const submitSelections = async () => {
    setConfirmOpen(false);
    if (targetId === null || !allSelected) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/organizer/winners/finalize?target_id=${encodeURIComponent(targetId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selections: titles.map((title) => ({
              title_id: title.title_id,
              candidate_id: selected[title.title_id],
            })),
          }),
        }
      );
      const data: ResultsResponse = await response.json();
      if (!response.ok) {
        setError(data.detail || "Unable to save title candidates.");
        return;
      }

      setMessage("Title candidates were confirmed successfully.");
      await loadResults();
    } catch {
      setError("Network error while saving title candidates.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1120px] mx-auto p-5 md:p-10 space-y-5"
    >
      {confirmOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[hsl(265_30%_10%)]/50 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <Crown className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="mt-4 text-center text-xl font-bold font-serif text-[hsl(265_30%_15%)]">
              Confirm final titles?
            </h2>
            <p className="mt-2 text-center text-sm text-slate-500">
              These selections will become the official results for every title. This can't be
              undone from here.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-[hsl(265_90%_98%)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitSelections()}
                className="flex-1 rounded-xl green-bg opacity-73 px-4 py-2.5 text-sm font-semibold text-white hover:opcity-80"
              >
                Confirm results
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setLocation("/admin/organizer")}
        className="flex items-center gap-2 text-sm font-semibold text-[hsl(265_10%_40%)] hover:text-[hsl(265_30%_15%)]"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Organizer Dashboard
      </button>

      <div className="rounded-3xl border border-[hsl(265_10%_90%)] bg-white p-6 md:p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100">
              <Trophy className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif font-bold text-2xl text-[hsl(265_30%_15%)]">Results</h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    finalized
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {finalized ? "Official" : "Draft"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500 max-w-md">
                {finalized
                  ? "Official manually selected titles."
                  : festivalStatus !== 2
                    ? "End the event first. Final titles can only be selected after voting is closed."
                    : "Each title defaults to its top-ranked candidate. Tap any of the top 3 to swap in a different winner."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadResults()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-[hsl(265_10%_88%)] px-4 py-2.5 text-sm font-semibold text-[hsl(265_30%_25%)] hover:bg-[hsl(265_50%_98%)] disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {message && (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {titles.map((title) => {
            const currentId = selected[title.title_id];
            const maxWeight = Math.max(...title.winners.map((c) => c.total_vote_weight), 1);
            const current = title.winners.find((candidate) => candidate.c_id === currentId) || title.winners[0];

            return (
              <div
                key={title.title_id}
                className="rounded-2xl border border-[hsl(265_10%_92%)] bg-[hsl(260_30%_99%)] p-5 space-y-4"
              >
                <h2 className="font-serif text-lg font-bold text-[hsl(265_30%_18%)]">{title.title}</h2>

                {finalized ? (
                  current ? (
                    <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3.5">
                      <Crown className="h-5 w-5 shrink-0 text-amber-600" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[hsl(265_30%_18%)]">{current.c_name}</p>
                        <p className="text-xs text-slate-500">Candidate No. {current.c_number}</p>
                      </div>
                    </div>
                  ) : null
                ) : festivalStatus !== 2 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    End the event from the Organizer Dashboard before choosing final candidates.
                  </div>
                ) : title.winners.length > 0 ? (
                  <div className="space-y-2">
                    {title.winners.map((candidate, index) => {
                      const isSelected = currentId === candidate.c_id;
                      const conflict = isSelected && candidateSelectedForAnotherTitle(candidate.c_id, title.title_id);
                      const medal = MEDALS[index] ?? MEDALS[2];
                      const barPct = Math.max((candidate.total_vote_weight / maxWeight) * 100, 4);

                      return (
                        <button
                          type="button"
                          key={candidate.c_id}
                          onClick={() => updateSelection(title.title_id, candidate.c_id)}
                          className={`w-full rounded-xl border p-3 text-left transition-all ${
                            isSelected
                              ? "border-[oklch(45%_0.07_180)] bg-white ring-2 ring-[oklch(95%_0.02_180)]"
                              : "border-[hsl(265_10%_90%)] bg-white/60 hover:border-[oklch(65%_0.06_180)] hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${medal.chip}`}
                            >
                              {medal.label}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-slate-800">{candidate.c_name}</p>
                                <span className="shrink-0 text-xs font-bold text-slate-400">
                                  {candidate.total_vote_weight}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400">No. {candidate.c_number}</p>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div className={`h-full rounded-full ${medal.bar}`} style={{ width: `${barPct}%` }} />
                              </div>
                            </div>
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                isSelected
                                  ? "border-[oklch(37%_0.067_180)] green-bg"
                                  : "border-slate-300"
                              }`}
                            >
                              {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </span>
                          </div>
                          {conflict && (
                            <p className="mt-2 flex items-center gap-1.5 pl-10 text-xs font-semibold text-amber-700">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Also picked for another title
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm italic text-slate-500">No ranked candidate is available for this title.</p>
                )}
              </div>
            );
          })}
        </div>

        {!loading && titles.length === 0 && !error && <p className="text-sm text-slate-500">No results are available.</p>}

        {!finalized && festivalStatus === 2 && titles.length > 0 && (
          <div className="flex items-center justify-between gap-4 border-t border-[hsl(265_10%_90%)] pt-5 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-[hsl(265_30%_20%)]">
                {selectedCount} of {titles.length}
              </span>
              <span className="text-slate-500">titles selected</span>
              {hasDuplicates && (
                <span className="ml-1 flex items-center gap-1 text-amber-700 font-semibold">
                  <AlertCircle className="h-3.5 w-3.5" /> resolve duplicate picks
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={!allSelected || submitting}
              onClick={() => setConfirmOpen(true)}
              className="rounded-xl green-bg px-6 py-3 text-sm font-bold text-white hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Announcing..." : "Announce winners"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default Results;