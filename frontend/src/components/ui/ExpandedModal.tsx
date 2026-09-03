import { motion } from 'framer-motion';
import { X } from 'lucide-react';

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

function ExpandedModal({
  candidate,
  categories,
  onClose,
  votes,
  onVote
}: {
  candidate: Candidate,
  categories: Category[],
  onClose: () => void,
  votes: Record<string, string>,
  onVote: (candidate: Candidate, catId: string, catTitle: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60 transition"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative w-full aspect-[3/4]">
          <img
            src={candidate.image}
            alt={candidate.name}
            className="w-full h-full object-cover"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3 text-white">
            <div>
              <div className="inline-block px-2.5 py-1 rounded-full bg-white/20 backdrop-blur text-[15px] font-semibold mb-2">
                No. {candidate.number}
              </div>

              <h2 className="text-2xl font-bold leading-tight">
                {candidate.name}
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const isVotedForThis = votes[cat.id] === candidate.id;

                const isCandidateAlreadyUsedElsewhere =Object.entries(votes).some(([key, id]) =>
                      key !== cat.id && id === candidate.id
                  );

                const isTitleAlreadyUsedByAnotherCandidate =Boolean(votes[cat.id]) && votes[cat.id] !== candidate.id;

                let buttonStyle = "bg-white/15 backdrop-blur border border-white/20 text-white hover:bg-white/25";

                if (isVotedForThis) {
                  buttonStyle =
                    "bg-white text-primary border-transparent";
                } else if (
                  isCandidateAlreadyUsedElsewhere ||
                  isTitleAlreadyUsedByAnotherCandidate
                ) {
                  buttonStyle =
                    "bg-black/40 text-white/40 border-white/10 cursor-not-allowed";
                }

                return (
                  <button
                    key={cat.id}
                    onClick={() => onVote(candidate, cat.id, cat.title)}
                    disabled={
                      isCandidateAlreadyUsedElsewhere ||
                      isTitleAlreadyUsedByAnotherCandidate
                    }
                    
                    className={`flex-1 min-w-[110px] flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold transition ${buttonStyle}`}
                  >
                    <span className="truncate">{cat.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export { ExpandedModal };