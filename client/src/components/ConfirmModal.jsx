/**
 * Reusable confirmation modal to replace browser confirm() dialogs.
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onClose - Called when user cancels
 * @param {function} onConfirm - Called when user confirms
 * @param {string} title - Modal heading
 * @param {string|React.ReactNode} message - Body text (supports JSX)
 * @param {string} [confirmLabel="Confirm"] - Confirm button text
 * @param {boolean} [destructive=false] - If true, confirm button is red
 * @param {boolean} [loading=false] - If true, confirm button shows loading state
 */
export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = "Confirm", destructive = false, loading = false }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
        <div className="text-sm text-gray-600 mb-6 whitespace-pre-line">{message}</div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-50 ${
              destructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            style={!destructive ? { backgroundColor: "var(--cam-blue)" } : {}}
          >
            {loading ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
