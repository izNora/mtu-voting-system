import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Crown, RotateCcw } from 'lucide-react';

interface Candidate {
  id: string; // e.g. "boy-1" or "girl-2"
  c_id: number;
  number: number;
  name: string;
  image: string;
  gender: 'boys' | 'girls';
  major?: string;
}

const DOT_WINDOW_SIZE = 5;

function CardStack({
  candidates,
  currentIndex,
  setIndex,
  onExpand,
  theme
}: {
  candidates: Candidate[],
  currentIndex: number,
  setIndex: (i: number) => void,
  onExpand: (c: Candidate) => void,
  theme: 'boys' | 'girls'
}) {
  const isBoys = theme === 'boys';
  const baseColor = isBoys ? 'border-sky-200/60' : 'border-rose-200/60';
  const accentColor = isBoys ? 'text-sky-900' : 'text-rose-900';
  const activeDotColor = isBoys ? 'bg-sky-600/75' : 'bg-rose-500/75';

  const isAtStart = currentIndex === 0;
  const isAtEnd = currentIndex === candidates.length - 1;

  // Clamp instead of wrap — no more endless swiping
  const nextCard = () => {
    if (candidates.length && currentIndex < candidates.length - 1) {
      setIndex(currentIndex + 1);
    }
  };
  const prevCard = () => {
    if (candidates.length && currentIndex > 0) {
      setIndex(currentIndex - 1);
    }
  };

  // Compute a centered window of dot indices, clamped to array bounds
  const total = candidates.length;
  const half = Math.floor(DOT_WINDOW_SIZE / 2);
  let windowStart = Math.max(0, currentIndex - half);
  let windowEnd = Math.min(total - 1, windowStart + DOT_WINDOW_SIZE - 1);
  windowStart = Math.max(0, windowEnd - DOT_WINDOW_SIZE + 1); // re-clamp if we hit the end early

  const visibleIndices = [];
  for (let i = windowStart; i <= windowEnd; i++) visibleIndices.push(i);

  const hasMoreBefore = windowStart > 0;
  const hasMoreAfter = windowEnd < total - 1;

  return (
    <div className="relative w-full max-w-[320px] flex flex-col items-center">
      <div className="relative w-full h-[425px] flex items-center justify-center perspective-1000">
        <AnimatePresence>
          {candidates.map((candidate, idx) => {
            let relIndex = idx - currentIndex;
            if (relIndex < 0 || relIndex > 2) return null;

            const isTop = relIndex === 0;

            return (
              <motion.div
                key={candidate.id}
                initial={{ scale: 0.8, y: 50, opacity: 0 }}
                animate={{
                  scale: 1 - relIndex * 0.05,
                  y: relIndex * 20,
                  rotateZ: isTop ? 0 : relIndex % 2 === 0 ? 3 : -3,
                  zIndex: 30 - relIndex,
                  opacity: 1 - relIndex * 0.2
                }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`absolute inset-0 mx-auto w-[280px] h-[380px] rounded-2xl cursor-pointer group shadow-xl bg-card border overflow-hidden ${baseColor}`}
                onClick={() => isTop && onExpand(candidate)}
                drag={isTop ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5}
                onDragEnd={(_e, { offset, velocity }) => {
                  const swipe = Math.abs(offset.x) * velocity.x;
                  if ((swipe < -10000 || offset.x < -100) && !isAtEnd) nextCard();
                  else if ((swipe > 10000 || offset.x > 100) && !isAtStart) prevCard();
                }}
              >
                <div className="absolute inset-x-0 top-0 h-full bg-card overflow-hidden">
                  <img
                    src={candidate.image}
                    alt={candidate.name}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-90 transition-transform duration-500 group-hover:scale-105"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
                </div>

                <div className={`absolute top-4 left-4 backdrop-blur-md bg-white/90 px-3 py-1 rounded-full border border-white/70 text-sm font-serif font-bold ${accentColor}`}>
                  No. {candidate.number}
                </div>

                <div className="absolute inset-x-0 bottom-0 h-[35%] p-6 flex flex-col justify-end">
                  <h3 className="text-2xl font-serif font-bold text-white drop-shadow-md truncate text-wrap">
                    {candidate.name}
                  </h3>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Windowed dot indicator with edge fade */}
      {total > 1 && (
        <div
          className="flex items-center justify-center gap-2 w-[140px]"
          style={{
            maskImage:
              (hasMoreBefore ? 'linear-gradient(to right, transparent, black 24px' : 'linear-gradient(to right, black, black') +
              ', black calc(100% - 24px), ' +
              (hasMoreAfter ? 'transparent)' : 'black)'),
            WebkitMaskImage:
              (hasMoreBefore ? 'linear-gradient(to right, transparent, black 24px' : 'linear-gradient(to right, black, black') +
              ', black calc(100% - 24px), ' +
              (hasMoreAfter ? 'transparent)' : 'black)'),
          }}
        >
          {visibleIndices.map((idx) => {
            const candidate = candidates[idx];
            const isActive = idx === currentIndex;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setIndex(idx)}
                aria-label={`Go to ${candidate.name}`}
                aria-current={isActive}
                className={`shrink-0 rounded-full transition-all duration-200 ${
                  isActive
                    ? `w-5 h-2 ${activeDotColor}`
                    : 'w-2 h-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            );
          })}
        </div>
      )}

      <div className="mt-4 flex gap-4 z-40">
        <button
          onClick={prevCard}
          disabled={isAtStart}
          className={`w-12 h-12 rounded-full glass-panel flex items-center justify-center transition-colors text-black ${
            isAtStart
              ? 'opacity-30 cursor-not-allowed'
              : 'hover:bg-white/10 hover:scale-110 active:scale-95'
          }`}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={nextCard}
          disabled={isAtEnd}
          className={`w-12 h-12 rounded-full glass-panel flex items-center justify-center transition-colors text-black ${
            isAtEnd
              ? 'opacity-30 cursor-not-allowed'
              : 'hover:bg-white/10 hover:scale-110 active:scale-95'
          }`}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

export {CardStack};