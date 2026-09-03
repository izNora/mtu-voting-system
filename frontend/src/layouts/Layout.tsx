import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Menu, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { getActiveVoterId } from "@/lib/voterSessions";

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();

  const queryVoterId = new URLSearchParams(window.location.search).get("voter_id");
  const voterId = queryVoterId || getActiveVoterId();
  const homeHref = voterId ? `/?voter_id=${encodeURIComponent(voterId)}` : "/";
  const voteHref = voterId ? `/vote?voter_id=${encodeURIComponent(voterId)}` : "/qr-entry";

  // Close the menu whenever the route changes (e.g. after tapping a link).
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  // Lock background scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const navLinks = [
    { href: homeHref, label: "Home" },
    { href: voteHref, label: "Cast Vote" },
  ];

  return (
    <nav className="fixed top-0 inset-x-0 z-50 glass-panel border-b-0 border-white/5">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link href={homeHref} className="flex items-center gap-2 group" onClick={() => setIsOpen(false)}>
          <Crown className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
          <span className="font-serif font-bold text-lg tracking-wide text-foreground">MTU Voting</span>
        </Link>

        {/* Inline links — visible on sm and up, hidden on mobile */}
        <div className="hidden sm:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Hamburger button — visible only below sm */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
          className="sm:hidden relative z-10 w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <AnimatePresence mode="wait" initial={false}>
            {isOpen ? (
              <motion.span
                key="close"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: 0.15 }}
                className="absolute"
              >
                <X className="w-6 h-6" />
              </motion.span>
            ) : (
              <motion.span
                key="menu"
                initial={{ opacity: 0, rotate: 90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -90 }}
                transition={{ duration: 0.15 }}
                className="absolute"
              >
                <Menu className="w-6 h-6" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {isOpen && (
          <div className="sm:hidden absolute top-full right-6 pt-2 flex justify-end">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="glass-panel rounded-lg border border-white/10 shadow-lg overflow-hidden w-fit"
            >
              <div className="flex flex-col items-start px-4 py-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors text-left py-2.5 whitespace-nowrap border-b border-white/5 last:border-b-0"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </nav>
    
  );
  
}

export default Navbar;