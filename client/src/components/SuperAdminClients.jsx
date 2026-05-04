import { useState, useEffect } from "react";
import ClientList from "./ClientList";
import AddClientModal from "./AddClientModal";

/**
 * SuperAdmin Clients page wrapper. Owns the list fetch + the Add
 * Client modal. Delegates the table itself to ClientList (which
 * handles health dots, sorting, and filter chips).
 *
 * Page header: H1 "Clients" + "Add client" CTA on the right. Replaces
 * the old full-width blue "Add Client" button which was a Tailwind
 * `.btn-primary` (CAM-blue) — now uses the V2 ink button so it reads
 * the same as the other primary actions across SuperAdmin.
 */

export default function SuperAdminClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const response = await fetch("/api/superadmin/clients", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load clients");
      const data = await response.json();
      setClients(data);
    } catch (err) {
      console.error("Error loading clients:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1
            className="font-semibold"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
              lineHeight: 1.1,
            }}
          >
            Clients
          </h1>
          <p className="text-[13px] mt-1.5" style={{ color: "var(--ink-3)" }}>
            All tenants on the platform. Sorted by health by default — risk first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="font-semibold transition flex-shrink-0"
          style={{
            padding: "8px 16px",
            fontSize: 13,
            borderRadius: 8,
            background: "var(--ink)",
            color: "white",
            border: "1px solid var(--ink)",
            boxShadow: "var(--shadow-sm)",
            cursor: "pointer",
          }}
        >
          + Add client
        </button>
      </div>

      {loading ? (
        <p className="text-center py-10" style={{ color: "var(--ink-4)" }}>
          Loading clients…
        </p>
      ) : (
        <ClientList clients={clients} />
      )}

      <AddClientModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={loadClients}
      />
    </div>
  );
}
