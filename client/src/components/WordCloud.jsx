const WORD_COLORS = [
  "var(--cam-blue)",
  "var(--cam-green)",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
];

export default function WordCloud({ frequencies, maxWords = 40 }) {
  if (!frequencies || frequencies.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        No word data available yet.
      </p>
    );
  }

  const words = frequencies.slice(0, maxWords);
  const maxCount = Math.max(...words.map((w) => w.count));
  const minCount = Math.min(...words.map((w) => w.count));
  const range = maxCount - minCount || 1;

  // Shuffle for visual variety (seeded from word list length for consistency)
  const shuffled = [...words].sort(() => Math.random() - 0.5);

  return (
    <div className="flex flex-wrap gap-2 justify-center items-center py-2">
      {shuffled.map((w, i) => {
        const ratio = (w.count - minCount) / range;
        const fontSize = 0.75 + ratio * 1.75; // 0.75rem to 2.5rem
        const opacity = 0.6 + ratio * 0.4;
        const color = WORD_COLORS[i % WORD_COLORS.length];

        return (
          <span
            key={w.word}
            className="inline-block font-semibold leading-tight cursor-default transition-transform hover:scale-110"
            style={{
              fontSize: `${fontSize}rem`,
              color,
              opacity,
            }}
            title={`${w.word}: ${w.count} mentions`}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
}
