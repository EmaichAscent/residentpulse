export const COLORS = {
  promoter: "#1AB06E",
  passive: "#FBBF24",
  detractor: "#EF4444",
  blue: "#3B9FE7",
  blueDark: "#2B7FC0",
};

export function barColor(score) {
  if (score <= 6) return COLORS.detractor;
  if (score <= 8) return COLORS.passive;
  return COLORS.promoter;
}

export function npsCategory(score) {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export function npsCategoryLabel(score) {
  if (score >= 9) return "Promoter";
  if (score >= 7) return "Passive";
  return "Detractor";
}

export function calculateNPS(sessions) {
  const scored = sessions.filter((s) => s.nps_score != null);
  if (scored.length === 0) return { score: 0, promoters: 0, passives: 0, detractors: 0, total: 0 };
  const promoters = scored.filter((s) => s.nps_score >= 9).length;
  const passives = scored.filter((s) => s.nps_score >= 7 && s.nps_score <= 8).length;
  const detractors = scored.filter((s) => s.nps_score <= 6).length;
  const score = Math.round(((promoters - detractors) / scored.length) * 100);
  return { score, promoters, passives, detractors, total: scored.length };
}

export function npsColor(score) {
  if (score >= 50) return COLORS.promoter;
  if (score >= 0) return COLORS.blue;
  return COLORS.detractor;
}

/** Parse **bold** markers into <strong> elements */
export function parseBoldText(text) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

/** Render markdown-style insights into React elements */
export function renderInsights(text) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements = [];
  let currentSection = [];

  lines.forEach((line, index) => {
    if (line.match(/^\*\*.*:\*\*$/)) {
      if (currentSection.length > 0) {
        elements.push(<p key={`p-${index}`} className="text-gray-700 mb-4">{parseBoldText(currentSection.join(" "))}</p>);
        currentSection = [];
      }
      const heading = line.replace(/\*\*/g, "");
      elements.push(<h3 key={`h-${index}`} className="text-lg font-bold text-gray-900 mt-6 mb-3">{heading}</h3>);
    } else if (line.match(/^\d+\.\s/)) {
      if (currentSection.length > 0) {
        elements.push(<p key={`p-${index}`} className="text-gray-700 mb-4">{parseBoldText(currentSection.join(" "))}</p>);
        currentSection = [];
      }
      const item = line.replace(/^\d+\.\s/, "");
      elements.push(
        <div key={`li-${index}`} className="flex gap-3 mb-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm font-semibold flex items-center justify-center">
            {line.match(/^\d+/)[0]}
          </span>
          <p className="text-gray-700 flex-1">{parseBoldText(item)}</p>
        </div>
      );
    } else if (line.trim()) {
      currentSection.push(line);
    } else if (currentSection.length > 0) {
      elements.push(<p key={`p-${index}`} className="text-gray-700 mb-4">{parseBoldText(currentSection.join(" "))}</p>);
      currentSection = [];
    }
  });

  if (currentSection.length > 0) {
    elements.push(<p key="p-last" className="text-gray-700 mb-4">{parseBoldText(currentSection.join(" "))}</p>);
  }

  return <div>{elements}</div>;
}

/** Copy insights text to clipboard with rich text fallback */
export async function copyInsights(text) {
  try {
    const htmlContent = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
    const plainText = text.replace(/\*\*/g, "");
    const clipboardItem = new ClipboardItem({
      "text/html": new Blob([htmlContent], { type: "text/html" }),
      "text/plain": new Blob([plainText], { type: "text/plain" }),
    });
    await navigator.clipboard.write([clipboardItem]);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text.replace(/\*\*/g, ""));
      return true;
    } catch {
      return false;
    }
  }
}
