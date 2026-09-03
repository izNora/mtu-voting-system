import { motion } from 'framer-motion';

const RAIN_SPARKLES = Array.from({ length: 12 }).map((_, i) => ({
  left: `${(i * 43) % 100}%`,
  size: 14 + ((i * 5) % 3) * 5, // 14 / 19 / 24 px
  duration: 2.8 + ((i * 13) % 30) / 10, // ~2.8s – 5.8s
  delay: -(((i * 7) % 40) / 10),
  twinkleDuration: 1.1 + ((i * 17) % 12) / 10, // ~1.1s – 2.3s
  rotate: (i * 37) % 360,
}));

function SparkleGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{
        display: 'block',
        filter: 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(220,225,235,0.9))',
      }}
    >
      {/* long cross rays */}
      <line x1="12" y1="1" x2="12" y2="9" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12" y1="15" x2="12" y2="23" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="1" y1="12" x2="9" y2="12" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="15" y1="12" x2="23" y2="12" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      {/* short diagonal rays */}
      <line x1="6.5" y1="6.5" x2="9.5" y2="9.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="14.5" y1="14.5" x2="17.5" y2="17.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="17.5" y1="6.5" x2="14.5" y2="9.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="9.5" y1="14.5" x2="6.5" y2="17.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
      {/* bright core */}
      <circle cx="12" cy="12" r="2.4" fill="#FFFFFF" />
    </svg>
  );
}

function SparkleField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {RAIN_SPARKLES.map((s, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: s.left, rotate: s.rotate }}
          initial={{ top: '-6%', opacity: 0 }}
          animate={{ top: '105%', opacity: [0, 1, 1, 0] }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: 'linear',
            times: [0, 0.1, 0.85, 1],
          }}
        >
          <motion.div
            animate={{ scale: [0.65, 1.35, 0.85, 1.2, 0.65], opacity: [0.7, 1, 0.85, 1, 0.7] }}
            transition={{
              duration: s.twinkleDuration,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <SparkleGlyph size={s.size} />
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

export { SparkleField };