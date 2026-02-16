import { useNavigate } from "react-router-dom";

export default function ReInterviewDialog({ lastInterviewDate, onSkip, onClose }) {
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
          profile before launching this round? This helps us ask better questions to your board members.
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => {
              onClose();
              navigate("/admin/onboarding?type=re_interview");
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
