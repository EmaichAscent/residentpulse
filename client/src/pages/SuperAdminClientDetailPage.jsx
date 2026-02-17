import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ChatBubble from "../components/ChatBubble";

export default function SuperAdminClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState(null);
  const [editPlanId, setEditPlanId] = useState(null);
  const [expandedInterview, setExpandedInterview] = useState(null);
  const [transcriptMessages, setTranscriptMessages] = useState([]);
  const [activity, setActivity] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [expandedAlertRound, setExpandedAlertRound] = useState(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    Promise.all([loadDetail(), loadInterviews(), loadPlans(), loadActivity(), loadAlerts()])
      .finally(() => setLoading(false));
  }, [id]);

  const loadDetail = async () => {
    const res = await fetch(`/api/superadmin/clients/${id}/detail`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setDetail(data);
      setEditData(data.client);
      setEditPlanId(data.subscription?.plan_id || null);
    }
  };

  const loadInterviews = async () => {
    const res = await fetch(`/api/superadmin/clients/${id}/interviews`, { credentials: "include" });
    if (res.ok) setInterviews(await res.json());
  };

  const loadPlans = async () => {
    const res = await fetch("/api/superadmin/plans", { credentials: "include" });
    if (res.ok) setPlans(await res.json());
  };

  const loadActivity = async () => {
    const res = await fetch(`/api/superadmin/clients/${id}/activity`, { credentials: "include" });
    if (res.ok) setActivity(await res.json());
  };

  const loadAlerts = async () => {
    const res = await fetch(`/api/superadmin/clients/${id}/alerts`, { credentials: "include" });
    if (res.ok) setAlerts(await res.json());
  };

  const loadTranscript = async (interviewId) => {
    if (expandedInterview === interviewId) {
      setExpandedInterview(null);
      setTranscriptMessages([]);
      return;
    }
    const res = await fetch(`/api/superadmin/clients/${id}/interviews/${interviewId}/messages`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setTranscriptMessages(data.messages || []);
      setExpandedInterview(interviewId);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/superadmin/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: editData.company_name,
          address_line1: editData.address_line1,
          address_line2: editData.address_line2,
          city: editData.city,
          state: editData.state,
          zip: editData.zip,
          phone_number: editData.phone_number
        }),
        credentials: "include"
      });

      if (editPlanId) {
        await fetch(`/api/superadmin/clients/${id}/subscription`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_id: editPlanId }),
          credentials: "include"
        });
      }

      await loadDetail();
    } catch (err) {
      alert("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = detail.client.status === "active" ? "inactive" : "active";
    if (!confirm(`${newStatus === "active" ? "Activate" : "Deactivate"} ${detail.client.company_name}?`)) return;

    await fetch(`/api/superadmin/clients/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
      credentials: "include"
    });
    await loadDetail();
  };

  const handleImpersonate = async () => {
    if (!confirm(`Impersonate ${detail.client.company_name}?`)) return;
    const res = await fetch(`/api/superadmin/clients/${id}/impersonate`, {
      method: "POST",
      credentials: "include"
    });
    if (res.ok) window.location.href = "/admin";
  };

  const handleReset = async () => {
    if (!confirm(`RESET "${detail.client.company_name}"?\n\nThis will delete:\n- Admin interviews & generated prompt\n- All survey rounds\n- All board member sessions & responses\n- Critical alerts\n\nBoard members will be preserved.\nAdmins will need to redo onboarding.\n\nThis cannot be undone.`)) return;

    setResetting(true);
    try {
      const res = await fetch(`/api/superadmin/clients/${id}/reset`, {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        alert("Client has been reset. Board members preserved.");
        await Promise.all([loadDetail(), loadInterviews(), loadActivity()]);
      } else {
        const data = await res.json();
        alert("Reset failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Reset failed: " + err.message);
    } finally {
      setResetting(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString() : "—";
  const formatDateTime = (d) => d ? new Date(d).toLocaleString() : "Never";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Client not found</p>
      </div>
    );
  }

  const { client, subscription, admins, member_count, community_count, survey_rounds, alert_summary, engagement, prompt_supplement } = detail;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="shadow-sm" style={{ backgroundColor: "var(--cam-blue)" }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <button onClick={() => navigate("/superadmin")} className="text-sm text-white/70 hover:text-white mb-1 block">
              &larr; Back to Clients
            </button>
            <h1 className="text-xl font-bold text-white">{client.company_name}</h1>
            <p className="text-sm text-white/60">{client.client_code}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleReset} disabled={resetting}
              className="px-3 py-1.5 text-xs font-medium text-red-200 border border-red-300/40 rounded-lg hover:bg-red-500/20 disabled:opacity-40">
              {resetting ? "Resetting..." : "Reset"}
            </button>
            <button onClick={handleImpersonate} disabled={client.status !== "active"}
              className="px-3 py-1.5 text-xs font-medium text-white border border-white/40 rounded-lg hover:bg-white/10 disabled:opacity-40">
              Impersonate
            </button>
            <button onClick={handleToggleStatus}
              className="px-3 py-1.5 text-xs font-medium text-white border border-white/40 rounded-lg hover:bg-white/10">
              {client.status === "active" ? "Deactivate" : "Activate"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Engagement Warning */}
        {engagement.warning && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800 font-medium">
              {engagement.days_since_login === null
                ? "No admin has ever logged in to this account."
                : `No admin login in ${engagement.days_since_login} days.`}
            </p>
          </div>
        )}

        {/* Overview Card */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
              client.status === "active" ? "bg-green-100 text-green-800"
              : client.status === "pending" ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
            }`}>{client.status}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
            <div><span className="text-gray-500 block">Board Members</span><span className="font-semibold">{member_count}</span></div>
            <div><span className="text-gray-500 block">Communities</span><span className="font-semibold">{community_count}</span></div>
            <div><span className="text-gray-500 block">Plan</span><span className="font-semibold">{subscription?.plan_display_name || "None"}</span></div>
            <div><span className="text-gray-500 block">Created</span><span className="font-semibold">{formatDate(client.created_at)}</span></div>
          </div>

          {/* Editable fields */}
          {editData && (
            <div className="border-t pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Company Name</label>
                  <input type="text" value={editData.company_name || ""} onChange={(e) => setEditData({...editData, company_name: e.target.value})} className="input-field-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Phone</label>
                  <input type="tel" value={editData.phone_number || ""} onChange={(e) => setEditData({...editData, phone_number: e.target.value})} className="input-field-sm mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Address</label>
                <input type="text" value={editData.address_line1 || ""} onChange={(e) => setEditData({...editData, address_line1: e.target.value})} className="input-field-sm mt-1" placeholder="Street address" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">City</label>
                  <input type="text" value={editData.city || ""} onChange={(e) => setEditData({...editData, city: e.target.value})} className="input-field-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">State</label>
                  <input type="text" value={editData.state || ""} onChange={(e) => setEditData({...editData, state: e.target.value})} className="input-field-sm mt-1" maxLength="2" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">ZIP</label>
                  <input type="text" value={editData.zip || ""} onChange={(e) => setEditData({...editData, zip: e.target.value})} className="input-field-sm mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Subscription Plan</label>
                <select value={editPlanId || ""} onChange={(e) => setEditPlanId(Number(e.target.value))} className="input-field-sm mt-1">
                  <option value="">No plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name} ({p.member_limit} board members, {p.survey_rounds_per_year} rounds/yr)</option>
                  ))}
                </select>
              </div>
              <button onClick={handleSave} disabled={saving} className="btn-primary-sm">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>

        {/* Interview & Prompt */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Interview & Prompt</h2>

          {prompt_supplement ? (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-1">Active Prompt Supplement</p>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {prompt_supplement}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-4">No interview completed yet. No prompt supplement active.</p>
          )}

          {/* Version History */}
          {interviews.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Interview History ({interviews.length})</p>
              <div className="space-y-2">
                {interviews.map((iv) => (
                  <div key={iv.id} className="border rounded-lg">
                    <button
                      onClick={() => loadTranscript(iv.id)}
                      className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
                    >
                      <div className="text-sm">
                        <span className="font-medium text-gray-900">
                          {iv.interview_type === "re_interview" ? "Re-interview" : "Initial Interview"}
                        </span>
                        <span className="text-gray-400 ml-2">{formatDate(iv.completed_at || iv.created_at)}</span>
                        <span className="text-gray-400 ml-2">{iv.message_count} messages</span>
                        <span className="text-gray-400 ml-2">by {iv.admin_email}</span>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        iv.status === "completed" ? "bg-green-100 text-green-700"
                        : iv.status === "abandoned" ? "bg-gray-100 text-gray-500"
                        : "bg-blue-100 text-blue-700"
                      }`}>{iv.status}</span>
                    </button>

                    {expandedInterview === iv.id && (
                      <div className="border-t px-4 py-3">
                        {iv.interview_summary && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-500 mb-1">Summary</p>
                            <p className="text-sm text-gray-700">{iv.interview_summary}</p>
                          </div>
                        )}
                        {iv.generated_prompt && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-500 mb-1">Generated Prompt</p>
                            <div className="bg-gray-50 rounded p-3 text-sm text-gray-600 whitespace-pre-wrap">{iv.generated_prompt}</div>
                          </div>
                        )}
                        {transcriptMessages.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-2">Transcript</p>
                            <div className="bg-gray-50 rounded-lg p-3 max-h-80 overflow-y-auto">
                              {transcriptMessages.map((m) => (
                                <ChatBubble key={m.id} role={m.role} content={m.content} timestamp={m.created_at} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Survey Rounds */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Survey Rounds</h2>
          {survey_rounds.length === 0 ? (
            <p className="text-sm text-gray-400">No survey rounds scheduled.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-gray-500">Round</th>
                    <th className="text-left py-2 font-medium text-gray-500">Status</th>
                    <th className="text-left py-2 font-medium text-gray-500">Scheduled</th>
                    <th className="text-left py-2 font-medium text-gray-500">Launched</th>
                    <th className="text-left py-2 font-medium text-gray-500">Closes</th>
                    <th className="text-left py-2 font-medium text-gray-500">Responses</th>
                  </tr>
                </thead>
                <tbody>
                  {survey_rounds.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{r.round_number}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          r.status === "in_progress" ? "bg-blue-100 text-blue-700"
                          : r.status === "concluded" ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                        }`}>{r.status === "in_progress" ? "In Progress" : r.status === "concluded" ? "Concluded" : "Planned"}</span>
                      </td>
                      <td className="py-2 text-gray-500">{formatDate(r.scheduled_date)}</td>
                      <td className="py-2 text-gray-500">{formatDate(r.launched_at)}</td>
                      <td className="py-2 text-gray-500">{formatDate(r.closes_at)}</td>
                      <td className="py-2 text-gray-500">{r.responses_completed || 0}/{r.members_invited || r.invitations_sent || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Warnings */}
        {alert_summary && alert_summary.total > 0 && (
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Warnings</h2>
            <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
              <div className="text-center">
                <span className="text-2xl font-bold text-gray-900">{alert_summary.total}</span>
                <span className="text-gray-500 block text-xs">Total</span>
              </div>
              <div className="text-center">
                <span className="text-2xl font-bold text-red-600">{alert_summary.active}</span>
                <span className="text-gray-500 block text-xs">Active</span>
              </div>
              <div className="text-center">
                <span className="text-2xl font-bold text-green-600">{alert_summary.solved}</span>
                <span className="text-gray-500 block text-xs">Solved</span>
              </div>
              <div className="text-center">
                <span className="text-2xl font-bold text-gray-400">{alert_summary.dismissed}</span>
                <span className="text-gray-500 block text-xs">Dismissed</span>
              </div>
            </div>

            {/* Group alerts by round */}
            {(() => {
              const byRound = {};
              alerts.forEach((a) => {
                const key = a.round_number ? `Round ${a.round_number}` : "Unassigned";
                if (!byRound[key]) byRound[key] = [];
                byRound[key].push(a);
              });
              return Object.entries(byRound).map(([roundLabel, roundAlerts]) => (
                <div key={roundLabel} className="border rounded-lg mb-2">
                  <button
                    onClick={() => setExpandedAlertRound(expandedAlertRound === roundLabel ? null : roundLabel)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{roundLabel}</span>
                      <span className="text-xs text-gray-500">({roundAlerts.length} alert{roundAlerts.length !== 1 ? "s" : ""})</span>
                      {roundAlerts.some((a) => !a.dismissed && !a.solved) && (
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                      )}
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedAlertRound === roundLabel ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedAlertRound === roundLabel && (
                    <div className="px-4 pb-3 space-y-2">
                      {roundAlerts.map((alert) => {
                        const isSolved = alert.solved;
                        const isDismissed = alert.dismissed;
                        const memberName = alert.first_name || alert.last_name
                          ? `${alert.first_name || ""} ${alert.last_name || ""}`.trim()
                          : alert.user_email;
                        return (
                          <div key={alert.id} className={`rounded-lg border p-3 text-sm ${
                            isSolved ? "bg-green-50 border-green-200" :
                            isDismissed ? "bg-gray-50 border-gray-200" :
                            alert.severity === "critical" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                alert.alert_type === "contract_termination" ? "bg-red-100 text-red-700" :
                                alert.alert_type === "legal_threat" ? "bg-purple-100 text-purple-700" :
                                alert.alert_type === "safety_concern" ? "bg-orange-100 text-orange-700" :
                                "bg-gray-100 text-gray-700"
                              }`}>
                                {alert.alert_type?.replace(/_/g, " ")}
                              </span>
                              {isSolved && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">Solved</span>}
                              {isDismissed && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">Dismissed</span>}
                              {!isSolved && !isDismissed && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">Active</span>}
                            </div>
                            <p className={`${isSolved ? "text-green-800" : isDismissed ? "text-gray-500" : "text-gray-800"}`}>
                              <strong>{memberName}</strong>
                              {alert.alert_community ? ` (${alert.alert_community})` : ""} — {alert.description}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{formatDateTime(alert.created_at)}</p>
                            {isSolved && alert.solve_note && (
                              <p className="text-xs text-green-700 mt-1 italic">Note: {alert.solve_note}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
        )}

        {/* Admin Users */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Users</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-gray-500">Email</th>
                  <th className="text-left py-2 font-medium text-gray-500">Created</th>
                  <th className="text-left py-2 font-medium text-gray-500">Last Login</th>
                  <th className="text-left py-2 font-medium text-gray-500">Onboarding</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const stale = !a.last_login_at || (Date.now() - new Date(a.last_login_at).getTime()) > 30 * 86400000;
                  return (
                    <tr key={a.id} className={`border-b last:border-0 ${stale ? "bg-amber-50/50" : ""}`}>
                      <td className="py-2 font-medium">{a.email}</td>
                      <td className="py-2 text-gray-500">{formatDate(a.created_at)}</td>
                      <td className={`py-2 ${stale ? "text-amber-600 font-medium" : "text-gray-500"}`}>
                        {formatDateTime(a.last_login_at)}
                      </td>
                      <td className="py-2">
                        {a.onboarding_completed
                          ? <span className="text-green-600 text-xs">Completed</span>
                          : <span className="text-gray-400 text-xs">Pending</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity */}
        {activity.length > 0 && (
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
            <div className="space-y-2 text-sm">
              {activity.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-1 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500 w-32 flex-shrink-0 text-xs">{formatDateTime(e.created_at)}</span>
                  <span className="text-gray-700">{e.actor_email || "System"} — {e.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
