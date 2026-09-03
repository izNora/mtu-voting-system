import { apiFetch } from "@/lib/api";
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AlertCircle, Download, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import Navbar from '@/layouts/Layout';

interface SubmittedVote {
  title: string;
  candidate_number: number;
  candidate_name: string;
  major?: string;
  // Optional — falls back to an initial badge when the backend doesn't send one.
  photo_url?: string;
}

interface BallotResponse {
  submitted?: boolean;
  submitted_votes?: SubmittedVote[];
  success?: boolean;
  valid?: boolean;
  detail?: string;
}

function getInitial(name: string) {
  return name?.trim()?.charAt(0)?.toUpperCase() || '?';
}

export default function VoteResult() {
  const [, setLocation] = useLocation();
  const voterId = new URLSearchParams(window.location.search).get("voter_id");
  const receiptRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittedVotes, setSubmittedVotes] = useState<SubmittedVote[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [generatedAt] = useState(() => new Date());

  useEffect(() => {
    if (!voterId) {
      setError("Missing voter ID.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const response = await apiFetch(
          `/api/voter/ballot?voter_id=${encodeURIComponent(voterId)}`,
          { credentials: "include" }
        );

        const data: BallotResponse = await response.json();

        if (data.valid === false) {
          setError(data.detail || "Your session is no longer valid.");
          setLoading(false);
          return;
        }

        if (!response.ok || data.success === false) {
          setError(data.detail || "Unable to load your results.");
          setLoading(false);
          return;
        }

        if (!data.submitted) {
          // Nothing submitted yet for this voter — nothing to show here.
          setLocation(`/vote?voter_id=${encodeURIComponent(voterId)}`);
          return;
        }

        setSubmittedVotes(data.submitted_votes || []);
        setLoading(false);
      } catch (e) {
        console.error("Failed to load vote result", e);
        setError("Network error while loading your results.");
        setLoading(false);
      }
    })();
  }, [voterId]);

  const handleDownload = async () => {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#F6F1E7',
      });
      const link = document.createElement('a');
      link.download = `vote-receipt-${voterId || 'ballot'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Failed to generate receipt image', e);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background px-6">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-muted-foreground text-sm">Loading your results...</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-gray-900 font-semibold">Couldn't load your results</p>
            <p className="text-muted-foreground text-sm mt-2">{error}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 py-14 pt-28">

        {/* Receipt */}
        <div className="relative w-full max-w-[420px]">
          <div
            ref={receiptRef}
            className="bg-white px-7 pt-8 pb-6 font-mono text-[#1c1a16] shadow-2xl"
          >
            {/* Masthead */}
            <div className="text-center">
              <p className="text-lg font-bold tracking-wide">MTU SCIENCE & TECH CLUB</p>
              <p className="mt-1 text-[10px] tracking-[0.25em] text-[#1c1a16]/50">
                VOTING SELECTIONS
              </p>
            </div>
            <div className="mt-4 border-t-2 border-[#1c1a16]" />

            {/* Ballot heading */}
            <div className="mt-5">
              <p className="text-xs text-[#1c1a16]/50">Your selections</p>
            </div>
            <div
              className="mt-4 h-px w-full"
              style={{ backgroundImage: 'repeating-linear-gradient(90deg, #1c1a16 0 6px, transparent 6px 12px)' }}
            />

            {/* Items */}
            <div className="mt-4 space-y-4">
              {submittedVotes.map((vote) => (
                <div key={vote.title} className="flex items-center gap-3">
                  {vote.photo_url ? (
                    <img
                      src={vote.photo_url}
                      alt={vote.candidate_name}
                      crossOrigin="anonymous"
                      className="h-10 w-10 shrink-0 rounded-full border border-[#1c1a16]/20 object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#1c1a16]/20 bg-[#1c1a16]/5 text-sm font-bold">
                      {getInitial(vote.candidate_name)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] uppercase tracking-wide text-[#1c1a16]/50">
                      No.{vote.candidate_number}
                    </p>
                    <p className="truncate text-sm font-bold leading-tight">{vote.candidate_name}</p>
                    {vote.major && (
                      <p className="truncate text-[10px] text-[#1c1a16]/40">{vote.major}</p>
                    )}
                  </div>

                  <span className="shrink-0 text-sm font-bold">{vote.title}</span>
                </div>
              ))}
            </div>

            {/* Reflection / thank-you */}
            <div className="mt-4 text-xs leading-relaxed text-[#1c1a16]/70 border-t-2 border-[#1c1a16] pt-3">
              <p>Thank you for your joyful participation.</p>
              <p>Every vote helps shape the results.</p>
              <p className="mt-2 text-right text-[#1c1a16]/50">— MTU SCIENCE & TECH CLUB</p>
            </div>

            <p className="mt-6 text-center text-[9px] tracking-widest text-[#1c1a16]/35">
              GENERATED {generatedAt.toLocaleString().toUpperCase()}
            </p>
          </div>

          {/* Torn bottom edge */}
          <div
            className="h-4 w-full"
            style={{
              backgroundImage:
                'linear-gradient(135deg, #F6F1E7 50%, transparent 50%), linear-gradient(-135deg, #F6F1E7 50%, transparent 50%)',
              backgroundSize: '16px 16px',
              backgroundRepeat: 'repeat-x',
              backgroundPosition: 'top',
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          className="flex items-center gap-2 rounded-xl green-bg px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {downloading ? 'Preparing...' : 'Download Your Selections'}
        </button>

      </div>
    </>
  );
}