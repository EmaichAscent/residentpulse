import { useNavigate } from "react-router-dom";

export default function ReInterviewDialog({ lastInterviewDate, interviewSummary, roundId, onSkip, onClose }) {
  const navigate = useNavigate();

  const monthsAgo = lastInterviewDate
    ? Math.round((Date.now() - new Date(lastInterviewDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;

  const timeText = monthsAgo && monthsAgo > 0
    ? `${monthsAgo} month${monthsAgo !== 1 ? "s" : ""}`
    : "some time";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Quick Check-In Before Launch
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          It's been {timeText} since your last check-in. Would you like to update your company
          profile before launching this round? This helps us ask better questions.
        </p>

        {interviewSummary && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Your Current Profile</p>
            <p className="text-sm text-gray-700 italic">{interviewSummary}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => {
              onClose();
              navigate(`/admin/onboarding?type=re_interview${roundId ? `&launch_round=${roundId}` : ""}`);
            }}
            className="flex-1 btn-primary"
          >
            Update Now
          </button>
          <button
            onClick={() => {
              onClose();
              onSkip();
            }}
            className="flex-1 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
