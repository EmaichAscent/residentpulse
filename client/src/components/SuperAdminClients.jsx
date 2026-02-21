import { useState, useEffect } from "react";
import ClientList from "./ClientList";
import AddClientModal from "./AddClientModal";

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
    <div>
      <div className="mb-4">
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
          Add Client
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-center py-10">Loading clients...</p>
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
