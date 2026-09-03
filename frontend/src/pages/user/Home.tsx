import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { CheckCircle2, ChevronRight, QrCode } from 'lucide-react';
import Navbar from '@/layouts/Layout';
import { apiFetch } from '@/lib/api';
import {
  getActiveVoterId,
  getSession,
  getVerifiedSessions,
  removeVerifiedSession,
  setActiveVoterId,
} from '@/lib/voterSessions';
import { SparkleField } from '@/components/ui/Sparkles';

function welcomeLines(festival?: string | null) {
  const raw = (festival || '').trim();

  if (!raw) {
    return { top: "Fresher's", bottom: 'Welcome!' };
  }

  if (/^(the\s+)?whole(?:\s+major)?$/i.test(raw)) {
    return { top: "The Whole Fresher's", bottom: 'Welcome!' };
  }

  const major = /major$/i.test(raw) ? raw : `${raw} Major`;
  return { top: `${major} Fresher's`, bottom: 'Welcome!' };
}

export default function Home() {
  const [, setLocation] = useLocation();
  const queryVoterId = new URLSearchParams(window.location.search).get('voter_id');
  const initialVoterId = queryVoterId || getActiveVoterId();
  const initialSession = getSession(initialVoterId);

  const [voterId, setVoterId] = useState<string | null>(initialVoterId);
  const [festival, setFestival] = useState<string | null>(initialSession?.festival || null);
  const [sessions, setSessions] = useState(() => getVerifiedSessions());

  useEffect(() => {
    const targetId = queryVoterId || getActiveVoterId();
    if (!targetId) return;
    setActiveVoterId(targetId);

    let active = true;
    apiFetch(`/api/voter/session?voter_id=${encodeURIComponent(targetId)}`, { credentials: 'include' })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          removeVerifiedSession(targetId);
          setSessions(getVerifiedSessions());
          setVoterId(null);
          setFestival(null);
          return;
        }
        const data = await response.json();
        setVoterId(String(data.voter_id));
        setFestival(data.festival || null);
      })
      .catch(() => {});

    return () => { active = false; };
  }, [queryVoterId]);

  const { top: titleTop, bottom: titleBottom } = useMemo(
    () => welcomeLines(voterId ? festival : null),
    [voterId, festival]
  );

  const activateSession = (id: string) => {
    const session = getSession(id);
    setActiveVoterId(id);
    setVoterId(id);
    setFestival(session?.festival || null);
    setLocation(`/?voter_id=${encodeURIComponent(id)}`);
  };

  const handleCastVote = () => {
    if (voterId) {
      setLocation(`/vote?voter_id=${encodeURIComponent(voterId)}`);
    } else {
      setLocation('/qr-entry');
    }
  };

  return (
    <>
    <Navbar />
    <div className="min-h-screen pt-8 overflow-x-hidden">

      <main className="container mx-auto px-4 md:px-6 max-w-5xl">

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="relative left-1/2 right-1/2 -mx-[50vw] w-screen"
        >
          <SparkleField />

          <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pt-14 pb-8 md:pt-20 md:pb-16">
            <div className="relative flex flex-col items-center">
              <motion.h1
                key={titleTop}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
                className="poster-display text-[3rem] sm:text-[5.5rem] md:text-[7.5rem] leading-[0.82] tracking-tight text-primary self-start -mb-3 md:-mb-6 z-10"
              >
                {titleTop}
              </motion.h1>

              <motion.img
                src="/crown.png"
                alt="Crown"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
                className="w-[240px] sm:w-[340px] md:w-[460px] h-auto -my-1 md:-my-4 drop-shadow-[0_18px_24px_rgba(0,0,0,0.18)]"
              />

              <motion.h1
                key={titleBottom}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
                className="poster-display text-[3rem] sm:text-[5.5rem] md:text-[7.5rem] leading-[0.82] tracking-tight text-primary self-end -mt-3 md:-mt-8 z-10"
              >
                {titleBottom}
              </motion.h1>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="mt-8 md:mt-10 text-center text-md text-neutral-600 font-light max-w-xl mx-auto"
            >
              Let's vote your favorite candidates for Fresher's Welcome!
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.75 }}
              className="mt-8 flex flex-col items-center gap-4"
            >
              <button
                type="button"
                onClick={handleCastVote}
                className="inline-flex items-center justify-center gap-3 px-7 py-3 rounded-full green-bg text-primary-foreground font-bold text-md hover:brightness-105 hover:scale-[1.02] active:scale-95 transition-all group shadow-lg shadow-primary/15"
              >
                <QrCode className="w-4 h-4" />
                <span>Cast Vote</span>
                <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </button>

              {!voterId && (
                <p className="text-sm text-neutral-500">
                  QR verification is required before voting.
                </p>
              )}
            </motion.div>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-10 mb-20">
          {/* Rules Section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="glass-panel rounded-2xl p-10 relative overflow-hidden group hover:border-primary/50 transition-colors"
          >
            <h2 className="text-2xl font-serif text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-[1px] bg-primary"></span>
              The Rules
            </h2>

            <ul className="space-y-4 text-muted-foreground">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>You may cast <strong>ONE</strong> vote per category.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>Candidate numbers are unique across all genders in the active festival.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>Your ballot is protected by a verified QR voter session.</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>Voting will be opened <strong>for 5 hours</strong>.</span>
              </li>
            </ul>
          </motion.div>

          {/* How to Vote Section */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="glass-panel rounded-2xl p-10 relative overflow-hidden group hover:border-primary/50 transition-colors"
          >

            <h2 className="text-2xl font-serif text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-[1px] bg-primary"></span>
              How to Vote
            </h2>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full green-bg text-primary-foreground flex items-center justify-center font-bold font-serif shrink-0 shadow-lg">1</div>
                <div>
                  <h3 className="font-medium text-lg mb-1 text-foreground">Scan Your Voter QR</h3>
                  <p className="text-sm text-muted-foreground">Scan your assigned voter QR code with your phone camera to verify.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full green-bg text-primary-foreground flex items-center justify-center font-bold font-serif shrink-0 shadow-lg">2</div>
                <div>
                  <h3 className="font-medium text-lg mb-1 text-foreground">Browse the Candidates</h3>
                  <p className="text-sm text-muted-foreground">After verification, swipe through the card stacks for Boys and Girls.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full green-bg text-primary-foreground flex items-center justify-center font-bold font-serif shrink-0 shadow-lg">3</div>
                <div>
                  <h3 className="font-medium text-lg mb-1 text-foreground">Cast Your Vote</h3>
                  <p className="text-sm text-muted-foreground">Tap the title you wish to vote for. Make it count!</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

      </main>
    </div>
    </>
  );
}