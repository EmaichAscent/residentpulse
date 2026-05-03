import { useState } from "react";

/**
 * AddAdminUserModal — invite-admin dialog reachable from
 * /admin/account → Team → "Invite admin".
 *
 * Phase-3 v2 redesign: paper-tinted overlay, Fraunces title,
 * --line-2 inputs with the v2 input style, --pulse primary CTA,
 * --pulse-tint success card, --coral-tint error card. Behavior
 * (POST /api/admin/users + 5s auto-close on success) is byte-for-byte
 * unchanged.
 */
export default function AddAdminUserModal({ isOpen, onClose, onAdd }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, first_name: firstName, last_name: lastName }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add admin user");
      }

      const data = await response.json();
      setSuccess(data);
      onAdd();

      setTimeout(() => {
        setFirstName("");
        setLastName("");
        setEmail("");
        setSuccess(null);
        onClose();
      }, 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputStyle = {
    border: "1px solid var(--line-2)",
    borderRadius: 10,
    padding: "9px 12px",
    backgroundColor: "white",
    color: "var(--ink)",
    fontSize: 13.5,
    width: "100%",
    outline: "none",
  };

  const labelStyle = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--ink-4)",
    marginBottom: 6,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(36,42,52,0.45)", fontFamily: "var(--font-sans)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl"
        style={{
          maxWidth: 460,
          width: "100%",
          padding: 24,
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="font-medium"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "-0.015em",
            color: "var(--ink)",
            marginBottom: 8,
          }}
        >
          Invite admin
        </h2>
        <p className="text-[13px]" style={{ color: "var(--ink-3)", marginBottom: 18 }}>
          They&apos;ll get an email with a temporary password to sign in.
        </p>

        {success ? (
          <>
            <div
              className="rounded-xl"
              style={{
                backgroundColor: "var(--pulse-tint)",
                border: "1px solid rgba(31,165,113,0.3)",
                padding: 14,
                marginBottom: 14,
              }}
            >
              <p
                className="text-[13px] font-semibold"
                style={{ color: "var(--pulse-deep)", marginBottom: 4 }}
              >
                Admin user created.
              </p>
              <p className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                Login credentials sent to{" "}
                <strong style={{ color: "var(--ink)" }}>{success.email}</strong>. They can use the
                temporary password in the email to sign in.
              </p>
            </div>

            <p className="text-[11px]" style={{ color: "var(--ink-4)", marginBottom: 14 }}>
              This dialog will close automatically in 5 seconds…
            </p>

            <button
              onClick={() => {
                setSuccess(null);
                setFirstName("");
                setLastName("");
                setEmail("");
                onClose();
              }}
              className="w-full font-semibold text-white rounded-xl transition hover:opacity-90"
              style={{
                backgroundColor: "var(--ink)",
                padding: "10px 18px",
                fontSize: 13.5,
              }}
            >
              Close
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label style={labelStyle}>First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={inputStyle}
                  placeholder="Jane"
                  autoFocus
                />
              </div>
              <div>
                <label style={labelStyle}>Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  style={inputStyle}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="mb-5">
              <label style={labelStyle}>Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                placeholder="newadmin@example.com"
                required
              />
              <p className="text-[11.5px] mt-1.5" style={{ color: "var(--ink-4)" }}>
                A temporary password will be generated and emailed to this address.
              </p>
            </div>

            {error && (
              <div
                className="rounded-lg"
                style={{
                  backgroundColor: "var(--coral-tint)",
                  border: "1px solid rgba(232,93,76,0.3)",
                  padding: 10,
                  marginBottom: 14,
                }}
              >
                <p className="text-[12.5px]" style={{ color: "var(--coral)" }}>
                  {error}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 font-semibold rounded-xl transition disabled:opacity-50"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--ink-2)",
                  border: "1px solid var(--line-2)",
                  padding: "10px 18px",
                  fontSize: 13.5,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 font-semibold text-white rounded-xl transition hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: "var(--pulse)",
                  boxShadow: "var(--shadow-sm)",
                  padding: "10px 18px",
                  fontSize: 13.5,
                }}
              >
                {loading ? "Sending invite…" : "Send invite →"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
