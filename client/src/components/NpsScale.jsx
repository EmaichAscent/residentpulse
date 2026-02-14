import { useState } from "react";

export default function NpsScale({ onSelect }) {
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const getColor = (n) => {
    if (selected === n) {
      if (n <= 6) return "bg-red-600 text-white";
      if (n <= 8) return "bg-yellow-500 text-white";
      return "nps-selected-high";
    }
    if (n <= 6) return "bg-red-50 text-red-700 hover:bg-red-100";
    if (n <= 8) return "bg-yellow-50 text-yellow-700 hover:bg-yellow-100";
    return "bg-green-50 text-green-700 hover:bg-green-100";
  };

  const handleConfirm = () => {
    if (selected !== null) {
      setConfirmed(true);
      onSelect(selected);
    }
  };

  if (confirmed) {
    return (
      <div className="text-center py-4 text-lg text-gray-500">
        You selected: <span className="font-bold text-gray-900">{selected}</span>
      </div>
    );
  }

  return (
    <div className="py-4">
      <p className="text-lg font-medium text-gray-700 mb-4 text-center">
        How likely are you to recommend your management company? (0-10)
      </p>
      <div className="flex gap-1.5 mb-4">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`flex-1 min-h-[48px] rounded-lg text-lg font-bold transition-all ${getColor(i)} border-2 ${selected === i ? "border-transparent ring-2 ring-offset-1 nps-ring" : "border-transparent"}`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-sm text-gray-400 mb-5 px-1">
        <span>Not likely</span>
        <span>Extremely likely</span>
      </div>
      <button
        onClick={handleConfirm}
        disabled={selected === null}
        className="btn-primary disabled:opacity-30"
      >
        Submit Score
      </button>
    </div>
  );
}
