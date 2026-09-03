import { apiFetch, apiUrl } from "@/lib/api";
import React, { useState, useEffect } from 'react';
import { useLocation } from "wouter";
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Crown, RotateCcw, Space } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Navbar from '@/layouts/Layout';
import { CardStack } from "@/components/ui/CardStack";
import { ExpandedModal } from "@/components/ui/ExpandedModal";
import { SparkleField } from "@/components/ui/Sparkles";

interface APICandidate {
  c_id: number;
  c_number: number;
  c_name: string;
  c_photo?: string;
  major?: string;
  c_gender: 'boy' | 'girl' | string;
}

interface APITitle {
  title_id: number;
  title: string;
  group: 'boy' | 'girl';
  selected_candidate_id?: number | null;
}

interface APISubmittedVote {
  title: string;
  candidate_number: number;
  candidate_name: string;
  major?: string;
}

interface APIBallot {
  voter_id: string;
  festival_target_id: number;
  festival: string;
  titles: APITitle[];
  candidates: APICandidate[];
  submitted?: boolean;
  submitted_votes?: APISubmittedVote[];
}

// Internal structure mapped to maintain original UI styling
interface Candidate {
  id: string; // e.g. "boy-1" or "girl-2"
  c_id: number;
  number: number;
  name: string;
  image: string;
  gender: 'boys' | 'girls';
  major?: string;
}

interface Category {
  id: string; // string key "cat-{title_id}" for matching component state
  title_id: number;
  title: string;
  icon: string;
}

export default function Vote() {
  const { toast } = useToast();
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [, setLocation] = useLocation();

  const voterId = new URLSearchParams(window.location.search).get("voter_id");

  // API state
  const [ballot, setBallot] = useState<APIBallot | null>(null);

  // Key-value mapping: `cat-${title_id}` -> `boy-${c_id}` or `girl-${c_id}`
  const [votes, setVotes] = useState<Record<string, string>>({});

  const [expandedCandidate, setExpandedCandidate] = useState<Candidate | null>(null);


  // Stacks states - indexing current top card
  const [boyIndex, setBoyIndex] = useState(0);
  const [girlIndex, setGirlIndex] = useState(0);

  // Confetti state
  const [showConfetti, setShowConfetti] = useState(false);

  // API 1: Poll voter session validity 
  const loadStatus = async () => {
    if (!voterId) return;

    try {
      const response = await apiFetch(
        `/api/voter/session?voter_id=${encodeURIComponent(voterId)}`,
        { credentials: "include" }
      );

      const data = await response.json();

      if (!response.ok || data.valid === false) {
        setQrAuthorized(false);
        setLocation("/qr-entry");
        return;
      }

      if (data.submitted && ballot && !ballot.submitted) {
        await loadBallot();
      }
    } catch (e) {
      console.error("Session check failed", e);
    }
  };

  const draftKeyFor = (festivalTargetId: number, voter: string) =>
    `qrVotingDraft:${festivalTargetId}:${voter}`;

  // API 2: Fetch Voter Ballot
  const [qrAuthorized, setQrAuthorized] = useState<boolean | null>(null);
  const loadBallot = async () => {
    if (!voterId) return;

    try {
      const response = await apiFetch(
        `/api/voter/ballot?voter_id=${encodeURIComponent(voterId)}`,
        { credentials: "include" }
      );

      const data: APIBallot & { success?: boolean; valid?: boolean; detail?: string } =
        await response.json();

      if (data.valid === false) {
        setQrAuthorized(false);
        setLocation("/qr-entry");
        return;
      }

      if (!response.ok || data.success === false) {
        toast({
          title: "Error",
          description: data.detail || "Unable to load ballot",
          variant: "destructive",
        });
        return;
      }

      setQrAuthorized(true);
      setBallot(data);

      const draftKey = draftKeyFor(data.festival_target_id, voterId);

      let stored: Record<string, string> = {};
      try {
        stored = JSON.parse(localStorage.getItem(draftKey) || "{}");
      } catch {}

      const initialVotes: Record<string, string> = { ...stored };

      if (data.submitted) {
        localStorage.removeItem(draftKey);
        setVotes({});
        setLocation(`/VoteResult?voter_id=${encodeURIComponent(voterId)}`);
        return;
      }

      data.titles.forEach((t) => {
        const catKey = `cat-${t.title_id}`;
        if (!initialVotes[catKey] && t.selected_candidate_id) {
          initialVotes[catKey] = `${t.group}-${t.selected_candidate_id}`;
        }
      });

      localStorage.setItem(draftKey, JSON.stringify(initialVotes));
      setVotes(initialVotes);
    } catch (e) {
      console.error("Failed to load ballot", e);
    }
  };

  useEffect(() => {
    if (!voterId) {
      setLocation("/qr-entry");
      return;
    }
    loadStatus();
    loadBallot();

    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const BOYS: Candidate[] = (ballot?.candidates || [])
    .filter((c) => c.c_gender === 'boy')
    .map((c) => ({
      id: `boy-${c.c_id}`,
      c_id: c.c_id,
      number: c.c_number,
      name: c.c_name,
      image: c.c_photo ? apiUrl(c.c_photo) : '',
      gender: 'boys',
      major: c.major,
    }));

  const GIRLS: Candidate[] = (ballot?.candidates || [])
    .filter((c) => c.c_gender === 'girl')
    .map((c) => ({
      id: `girl-${c.c_id}`,
      c_id: c.c_id,
      number: c.c_number,
      name: c.c_name,
      image: c.c_photo ? apiUrl(c.c_photo) : '',
      gender: 'girls',
      major: c.major,
    }));

  const CATEGORIES: Record<'boys' | 'girls', Category[]> = {
    boys: (ballot?.titles || [])
      .filter((t) => t.group === 'boy')
      .map((t) => ({
        id: `cat-${t.title_id}`,
        title_id: t.title_id,
        title: t.title,
        icon: 'Crown',
      })),
    girls: (ballot?.titles || [])
      .filter((t) => t.group === 'girl')
      .map((t) => ({
        id: `cat-${t.title_id}`,
        title_id: t.title_id,
        title: t.title,
        icon: 'Crown',
      })),
  };

  const allCategories = [...CATEGORIES.boys, ...CATEGORIES.girls];
  const allTitlesSelected =
    allCategories.length > 0 && allCategories.every((category) => Boolean(votes[category.id]));

  useEffect(() => {
    if (!ballot || !voterId) return;

    const draftKey = draftKeyFor(ballot.festival_target_id, voterId);
    localStorage.setItem(draftKey, JSON.stringify(votes));
  }, [votes]);

  const handleVote = (
  candidate: Candidate,
  categoryId: string,
  categoryTitle: string
    ) => {
      // Is this candidate already selected for another title?
      const usedByOtherTitle = Object.entries(votes).find(
        ([key, candidateId]) =>
          key !== categoryId && candidateId === candidate.id
      );

      if (usedByOtherTitle) {
        toast({
          title: "Candidate Already Used",
          description: `${candidate.name} has already been selected for another title.`,
          duration: 2500,
        });
        return;
      }

      // Is this title already assigned to another candidate?
      const selectedCandidateForThisTitle = votes[categoryId];

      if (
        selectedCandidateForThisTitle &&
        selectedCandidateForThisTitle !== candidate.id
      ) {
        toast({
          title: "Title Already Selected",
          description: `${categoryTitle} has already been assigned to another candidate. Deselect it first before choosing another candidate.`,
          duration: 2500,
        });
        return;
      }

      // Clicking currently selected title again = deselect it
      if (selectedCandidateForThisTitle === candidate.id) {
        setVotes((prev) => {
          const next = { ...prev };
          delete next[categoryId];
          return next;
        });

        setExpandedCandidate(null);
        return;
      }

      // Normal selection
      setVotes((prev) => ({
        ...prev,
        [categoryId]: candidate.id,
      }));

      setExpandedCandidate(null);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1600);
    };

  const submitBallot = async () => {
    if (!ballot || !voterId) return;

    const selections = allCategories
      .filter((cat) => Boolean(votes[cat.id]))
      .map((cat) => ({
        title_id: cat.title_id,
        candidate_id: Number(votes[cat.id].split("-")[1]),
      }));

    if (selections.length !== allCategories.length) {
      toast({
        title: "Complete Every Title",
        description: "Please choose one candidate for every title before submitting your ballot.",
        variant: "destructive",
      });
      return;
    }

    if (!submitConfirmOpen) {
      setSubmitConfirmOpen(true);
      return;
    }
    setSubmitConfirmOpen(false);

    try {
      const res = await apiFetch(
        `/api/voter/submit?voter_id=${encodeURIComponent(voterId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ selections }),
        }
      );

      const data: { ok?: boolean; submitted?: boolean; message?: string; detail?: string } =
        await res.json();

      if (!res.ok || data.ok !== true) {
        toast({
          title: "Submit Failed",
          description: data.detail || "Your ballot was not submitted. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // clear draft
      const draftKey = draftKeyFor(ballot.festival_target_id, voterId);
      localStorage.removeItem(draftKey);

      toast({
        title: "Vote Submitted",
        description: data.message || "Your vote is final",
      });

      await loadBallot();
      setLocation(`/VoteResult?voter_id=${encodeURIComponent(voterId)}`);

    } catch {
      toast({
        title: "Error",
        description: "Network error",
        variant: "destructive",
      });
    }
  };

  if (qrAuthorized === null) {
    // Keep the transition blank while the secure cookie/session is checked.
    // Showing "QR Access Required" here caused a visible flash after a valid scan.
    return <div className="min-h-screen bg-background" aria-busy="true" />;
  }

  return (
    <>
      <Navbar />
      <SparkleField />
      <div className="min-h-screen relative overflow-hidden pt-22 pb-10">

      <div className="container mx-auto px-4 relative z-10 h-full flex flex-col">

        <header className="text-center mb-8">
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="poster-display text-4xl md:text-5xl green-text inline-block"
            >
              {ballot?.festival ? `${ballot.festival}${/major$/i.test(ballot.festival) ? "" : " Major"} Welcome` : "Cast Your Votes"}
            </motion.h1>

            <p className="text-muted-foreground mt-4 font-light text-lg">
              Tap a card to view and vote.
            </p>
        </header>

        <div className="flex-1 grid md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full">
          {/* Boys Stack */}
          <div className="flex flex-col items-center">
            <CardStack
              candidates={BOYS}
              currentIndex={boyIndex}
              setIndex={setBoyIndex}
              onExpand={setExpandedCandidate}
              theme="boys"
            />
            <button type="button" 
              onClick={() => setVotes(prev => { const next = {...prev}; 
              CATEGORIES.boys.forEach(c => delete next[c.id]); 
              return next; })} 
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <RotateCcw className="h-4 w-4" /> 
                Reset Boys Votes</button>
          </div>

          {/* Girls Stack */}
          <div className="flex flex-col items-center">
            <CardStack
              candidates={GIRLS}
              currentIndex={girlIndex}
              setIndex={setGirlIndex}
              onExpand={setExpandedCandidate}
              theme="girls"
            />
            <button type="button" 
              onClick={() => setVotes(prev => { const next = {...prev}; 
              CATEGORIES.girls.forEach(c => delete next[c.id]); 
              return next; })} 
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <RotateCcw className="h-4 w-4" /> 
              Reset Girls Votes</button>
          </div>
        </div>
        {/* Submit Button */}
        <div className="flex justify-center items-center mt-8">
          <button
            onClick={submitBallot}
            disabled={!allTitlesSelected}
            className={`px-8 py-3 rounded-lg transition shadow-md font-semibold ${
              allTitlesSelected
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'cursor-not-allowed bg-slate-200 text-slate-500 shadow-none'
            }`}
          >
            {allTitlesSelected ? 'Submit Ballot' : 'Select All Titles to Submit'}
          </button>
        </div>
      </div>

      {submitConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900">
              Confirm Voting Submission</h2>
            <p className="mt-2 text-sm text-slate-600">
              Please confirm before submitting. Once submitted, your vote is final and cannot be changed.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setSubmitConfirmOpen(false)} 
              className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700">
                Cancel</button>
              <button type="button" onClick={submitBallot} 
              className="rounded-xl bg-primary px-4 py-2 font-semibold text-white">
                Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Modal */}
      <AnimatePresence>
        {expandedCandidate && (
          <ExpandedModal
            candidate={expandedCandidate}
            categories={CATEGORIES[expandedCandidate.gender]}
            votes={votes}
            onVote={handleVote}
            onClose={() => setExpandedCandidate(null)}
          />
        )}
      </AnimatePresence>

      {/* Confetti Overlay */}
      <AnimatePresence>
        {showConfetti && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
          >
            {Array.from({ length: 50 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  scale: 0,
                  x: 0,
                  y: 0,
                  rotate: 0
                }}
                animate={{
                  scale: [0, 1, 0.5],
                  x: (Math.random() - 0.5) * window.innerWidth,
                  y: (Math.random() - 0.5) * window.innerHeight,
                  rotate: 360 * Math.random()
                }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className={`absolute w-3 h-3 rounded-full ${['bg-primary', 'bg-blue-400', 'bg-pink-400', 'bg-white'][Math.floor(Math.random() * 4)]}`}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </>
  );
}
