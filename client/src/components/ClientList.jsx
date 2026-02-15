import { useState } from "react";

export default function ClientList({ clients, onEdit, onToggleStatus, onImpersonate, onRefresh }) {
  const [search, setSearch] = useState("");

  const filtered = clients.filter(client =>
    client.company_name.toLowerCase().includes(search.toLowerCase())
  );

  const formatAddress = (client) => {
    const parts = [];
    if (client.address_line1) parts.push(client.address_line1);
    if (client.address_line2) parts.push(client.address_line2);

    const cityStateZip = [];
    if (client.city) cityStateZip.push(client.city);
    if (client.state) cityStateZip.push(client.state);
    if (client.zip) cityStateZip.push(client.zip);

    if (cityStateZip.length > 0) {
      parts.push(cityStateZip.join(", "));
    }

    return parts.length > 0 ? parts.join(", ") : "—";
  };

  return (
    <div>
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="input-field flex-1"
        />
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Company Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plan
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Admins
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-8 text-center text-gray-400">
                  No clients found
                </td>
              </tr>
            ) : (
              filtered.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{client.company_name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 max-w-xs truncate" title={formatAddress(client)}>
                      {formatAddress(client)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {client.plan_name || "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        client.status === "active"
                          ? "bg-green-100 text-green-800"
                          : client.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {client.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {client.admin_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(client.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => onImpersonate(client)}
                      className="text-blue-600 hover:text-blue-900"
                      disabled={client.status !== "active"}
                    >
                      Impersonate
                    </button>
                    <button
                      onClick={() => onEdit(client)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onToggleStatus(client)}
                      className={client.status === "active" ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"}
                    >
                      {client.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
