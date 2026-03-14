import { useState, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import SurveySchedule from "./SurveySchedule";
import { COLORS, npsColor } from "../utils/npsHelpers";

export default function RoundsLanding() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingRound, setClosingRound] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);
  const [cadence, setCadence] = useState(null);
  const [maxCadence, setMaxCadence] = useState(null);
  const [cadenceUpdating, setCadenceUpdating] = useState(false);
  const [cadenceMessage, setCadenceMessage] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [memberLimit, setMemberLimit] = useState(null);
  const [interviewCompleted, setInterviewCompleted] = useState(false);
  const [hasLogo, setHasLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [googleReviewEnabled, setGoogleReviewEnabled] = useState(false);
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewMessage, setReviewMessage] = useState(null);

  useEffect(() => {
    loadRounds();
    loadAccount();
    loadInterviewStatus();
  }, []);

  const loadInterviewStatus = async () => {
    try {
      const res = await fetch("/api/admin/interview/status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setInterviewCompleted(data.hasCompletedInterview);
      }
    } catch (err) {
      console.error("Failed to load interview status:", err);
    }
  };

  const loadAccount = async () => {
    try {
      const res = await fetch("/api/admin/account", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCadence(data.subscription?.survey_cadence || 2);
        setMaxCadence(data.subscription?.survey_rounds_per_year || 2);
        setMemberCount(data.usage?.member_count || 0);
        setMemberLimit(data.subscription?.member_limit || null);
        setHasLogo(!!data.has_logo);
        setGoogleReviewEnabled(!!data.google_review_enabled);
        setGoogleReviewUrl(data.google_review_url || "");
      }
    } catch (err) {
      console.error("Failed to load account:", err);
    }
  };

  const loadRounds = async () => {
    try {
      const res = await fetch("/api/admin/survey-rounds", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setRounds(data);
      }
    } catch (err) {
      console.error("Failed to load rounds:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCadenceChange = async (newCadence) => {
    if (newCadence === cadence || cadenceUpdating) return;
    setCadenceUpdating(true);
    setCadenceMessage(null);
    try {
      const res = await fetch("/api/admin/account/cadence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ survey_cadence: newCadence }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCadence(newCadence);
      setCadenceMessage(data.message);
      await loadRounds();
      setTimeout(() => setCadenceMessage(null), 8000);
    } catch (err) {
      setCadenceMessage(err.message);
      setTimeout(() => setCadenceMessage(null), 8000);
    } finally {
      setCadenceUpdating(false);
    }
  };

  const handleCloseRound = async (roundId) => {
    setClosingRound(roundId);
    try {
      const res = await fetch(`/api/admin/survey-rounds/${roundId}/close`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setConfirmClose(null);
        await loadRounds();
      }
    } catch (err) {
      console.error("Failed to close round:", err);
    } finally {
      setClosingRound(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    // For date-only strings (YYYY-MM-DD), parse as local date to avoid timezone shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-");
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const daysRemaining = (closesAt) => {
    if (!closesAt) return null;
    const diff = new Date(closesAt) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const handleLogoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setLogoError("");
    const allowedTypes = ["image/png", "image/jpeg", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) { setLogoError("Only PNG, JPG, and SVG files are accepted."); return; }
    if (file.size > 500 * 1024) { setLogoError("Logo must be under 500KB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (file.type !== "image/svg+xml") {
        const img = new Image();
        img.onload = () => {
          const ratio = img.width / img.height;
          if (ratio < 0.8) { setLogoError("Portrait logos are not supported. Use a landscape or square image."); return; }
          if (ratio > 3) { setLogoError("Logo is too wide. Maximum aspect ratio is 3:1."); return; }
          uploadLogo(dataUrl, file.type, img.width, img.height);
        };
        img.src = dataUrl;
      } else {
        uploadLogo(dataUrl, file.type);
      }
    };
    reader.readAsDataURL(file);
  };

  const uploadLogo = async (dataUrl, mimeType, width, height) => {
    setLogoUploading(true);
    const base64 = dataUrl.split(",")[1];
    try {
      const res = await fetch("/api/admin/account/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_base64: base64, logo_mime_type: mimeType, width, height }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setLogoPreview(dataUrl);
      setHasLogo(true);
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setLogoUploading(false);
    }
  };

  const handleReviewToggle = async (newVal) => {
    setGoogleReviewEnabled(newVal);
    setReviewSaving(true);
    setReviewMessage(null);
    try {
      const res = await fetch("/api/admin/account/google-review", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newVal, url: googleReviewUrl }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setReviewMessage({ type: "success", text: newVal ? "Google Reviews enabled." : "Google Reviews disabled." });
    } catch (err) {
      setGoogleReviewEnabled(!newVal);
      setReviewMessage({ type: "error", text: err.message });
    } finally {
      setReviewSaving(false);
    }
  };

  const handleReviewUrlSave = async () => {
    setReviewSaving(true);
    setReviewMessage(null);
    try {
      const res = await fetch("/api/admin/account/google-review", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: googleReviewEnabled, url: googleReviewUrl }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setReviewMessage({ type: "success", text: "Review URL saved." });
    } catch (err) {
      setReviewMessage({ type: "error", text: err.message });
    } finally {
      setReviewSaving(false);
    }
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-10">Loading rounds...</p>;
  }

  const activeRounds = rounds.filter((r) => r.status === "in_progress");
  const completedRounds = rounds.filter((r) => r.status === "concluded");
  const plannedRounds = rounds.filter((r) => r.status === "planned");

  // Build welcome greeting
  const welcomeName = user?.first_name
    ? `${user.first_name}${user.company_name ? ` — ${user.company_name}` : ""}`
    : user?.company_name || null;

  // No rounds at all — show launch checklist + philosophy
  if (rounds.length === 0) {
    return (
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome{welcomeName ? `, ${welcomeName}` : ""}!
          </h2>
          <p className="text-gray-500 mt-1">Let's get your first survey round live.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column — Launch Checklist */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-5">Get Live in 3 Steps</h3>
            <p className="text-xs text-gray-400 mb-4 -mt-3">Plus optional extras to enhance your experience</p>

            {/* Step 1: AI Interview */}
            <div className="flex gap-4 mb-6">
              <div className="flex-shrink-0 mt-0.5">
                {interviewCompleted ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--cam-green)" }}>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: "var(--cam-blue)" }}>
                    1
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Tell Us About Your Business</p>
                {interviewCompleted ? (
                  <p className="text-sm text-green-600 font-medium mt-0.5">Completed</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mt-0.5">A quick conversation with our AI so we can personalize your board member interviews.</p>
                    <button
                      onClick={() => navigate("/admin/onboarding")}
                      className="mt-2 px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
                      style={{ backgroundColor: "var(--cam-blue)" }}
                    >
                      Start Interview
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Step 2: Add Members */}
            <div className="flex gap-4 mb-6">
              <div className="flex-shrink-0 mt-0.5">
                {memberCount > 0 ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--cam-green)" }}>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: "var(--cam-blue)" }}>
                    2
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Add Your Members</p>
                {memberCount > 0 ? (
                  <p className="text-sm text-green-600 font-medium mt-0.5">{memberCount} member{memberCount !== 1 ? "s" : ""} added</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mt-0.5">Load your board members so they can receive survey invitations.</p>
                    <button
                      onClick={() => navigate("/admin/members")}
                      className="mt-2 px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
                      style={{ backgroundColor: "var(--cam-blue)" }}
                    >
                      Add Members
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Step 3: Schedule First Round */}
            <div className="flex gap-4 mb-6">
              <div className="flex-shrink-0 mt-0.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${memberCount > 0 ? "text-white" : "bg-gray-200 text-gray-400"}`} style={memberCount > 0 ? { backgroundColor: "var(--cam-blue)" } : {}}>
                  3
                </div>
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${memberCount > 0 ? "text-gray-900" : "text-gray-400"}`}>Schedule Your First Round</p>
                {memberCount > 0 ? (
                  <div className="mt-2">
                    <SurveySchedule embedded onScheduled={loadRounds} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mt-0.5">Add members first to unlock scheduling.</p>
                )}
              </div>
            </div>

            {/* Optional divider */}
            <div className="border-t border-gray-100 pt-4 mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Optional</p>
            </div>

            {/* Step 4: Upload Logo */}
            <div className="flex gap-4 mb-6">
              <div className="flex-shrink-0 mt-0.5">
                {hasLogo ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--cam-green)" }}>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-gray-300 text-gray-400">
                    4
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Add Your Logo</p>
                <p className="text-sm text-gray-500 mt-0.5">Personalize survey emails and the board member experience with your company logo.</p>
                {(logoPreview || hasLogo) && (
                  <img src={logoPreview || "/api/admin/account/logo"} alt="Company logo" className="mt-2 max-h-12 rounded" />
                )}
                <label
                  className="mt-2 inline-block px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: "var(--cam-green)" }}
                >
                  {logoUploading ? "Uploading..." : hasLogo ? "Replace Logo" : "Upload Logo"}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoSelect} disabled={logoUploading} className="hidden" />
                </label>
                {logoError && <p className="text-xs text-red-600 mt-1">{logoError}</p>}
              </div>
            </div>

            {/* Step 5: Activate Google Reviews */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 mt-0.5">
                {googleReviewEnabled ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--cam-green)" }}>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-gray-300 text-gray-400">
                    5
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Activate Google Reviews</p>
                <p className="text-sm text-gray-500 mt-0.5">Automatically prompt happy board members to leave a Google review after their interview.</p>
                <div className="flex items-center gap-3 mt-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={googleReviewEnabled}
                      onChange={(e) => handleReviewToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                  </label>
                  <span className="text-sm font-medium text-gray-700">
                    {googleReviewEnabled ? "Enabled" : "Disabled"}
                  </span>
                  {reviewSaving && <span className="text-xs text-gray-400">Saving...</span>}
                </div>
                {googleReviewEnabled && (
                  <div className="mt-3">
                    <input
                      type="url"
                      value={googleReviewUrl}
                      onChange={(e) => setGoogleReviewUrl(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="g.page/r/your-business/review"
                    />
                    <p className="text-xs text-gray-400 mt-1">Paste your Google Business review link here.</p>
                    <button
                      onClick={handleReviewUrlSave}
                      disabled={reviewSaving}
                      className="mt-2 px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: "var(--cam-green)" }}
                    >
                      {reviewSaving ? "Saving..." : "Save URL"}
                    </button>
                  </div>
                )}
                {reviewMessage && (
                  <p className={`text-xs mt-1 ${reviewMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                    {reviewMessage.text}
                  </p>
                )}
              </div>
            </div>

            {/* Step 6: Try Test Mode (only when feature flag is on) */}
            {user?.test_mode_feature && (
              <div className="flex gap-4 mt-6">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 border-gray-300 text-gray-400">
                    6
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">Try a Test Run</p>
                  <p className="text-sm text-gray-500 mt-0.5">Preview the full survey experience with sample data before going live. No real emails sent.</p>
                  <p className="text-xs text-gray-400 mt-1">Use the <span className="font-semibold">Test Mode</span> toggle in the header to get started.</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column — Sticky sidebar */}
          <div className="lg:self-start lg:sticky lg:top-6 space-y-4">
            {/* Progress Tracker */}
            {(() => {
              const completed = [interviewCompleted, memberCount > 0, false, hasLogo, googleReviewEnabled].filter(Boolean).length;
              const total = 5;
              const pct = Math.round((completed / total) * 100);
              return (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-900">Your Progress</h3>
                    <span className="text-sm font-semibold" style={{ color: "var(--cam-green)" }}>{completed}/{total}</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: "var(--cam-green)" }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {completed === 0 ? "Let's get started!" : completed < 3 ? "Great start — keep going!" : completed < 5 ? "Almost there!" : "You're all set!"}
                  </p>
                </div>
              );
            })()}

            {/* How It Works */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">How ResidentPulse Works</h3>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(59, 159, 231, 0.1)" }}>
                    <svg className="w-5 h-5" style={{ color: "var(--cam-blue)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">AI-Powered Interviews</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Personalized conversations — not generic surveys — that surface what matters.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(26, 176, 110, 0.1)" }}>
                    <svg className="w-5 h-5" style={{ color: "var(--cam-green)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Consistency Is Key</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      30-day rounds build powerful sentiment trends over time.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(59, 159, 231, 0.1)" }}>
                    <svg className="w-5 h-5" style={{ color: "var(--cam-blue)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Minimal Effort, Maximum Impact</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Launch, and we handle the rest — interviews, analysis, and insights.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Value Props for Optional Features */}
            <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Why Personalize?</h3>
              <div className="space-y-3">
                <div className="flex gap-2.5">
                  <span className="text-base mt-0.5">🎨</span>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="font-semibold text-gray-800">Your logo</span> in survey emails builds trust and increases response rates.
                  </p>
                </div>
                <div className="flex gap-2.5">
                  <span className="text-base mt-0.5">⭐</span>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="font-semibold text-gray-800">Google Reviews</span> turn happy board members into public advocates for your community.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isTestMode = user?.test_mode_feature && user?.current_mode === "test";

  return (
    <div className="space-y-6">
      {/* Test Mode Guide */}
      {isTestMode && activeRounds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-amber-900 mb-3">Try the Full Survey Experience</h3>
          <div className="space-y-2.5">
            <div className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-bold">1</span>
              <p className="text-sm text-amber-800">
                Go to <button onClick={() => navigate("/admin/members")} className="font-semibold underline hover:text-amber-600">Members</button> and click <span className="font-semibold">Take Survey</span> next to any test member
              </p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-bold">2</span>
              <p className="text-sm text-amber-800">Complete the AI interview — rate, chat, and finish just like a real board member would</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-bold">3</span>
              <p className="text-sm text-amber-800">Come back here to see results populate in the dashboard — NPS scores, summaries, and insights</p>
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-3">Do this for multiple members to see how a real round looks with varied responses.</p>
        </div>
      )}

      {/* Active Rounds */}
      {activeRounds.map((round) => {
        const responded = round.responses_completed || 0;
        const invited = round.members_invited || 0;
        const progress = invited > 0 ? Math.round((responded / invited) * 100) : 0;
        const days = daysRemaining(round.closes_at);

        return (
          <div
            key={round.id}
            className="bg-white rounded-xl border-2 border-blue-200 shadow-sm overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-blue-100 flex items-center justify-between" style={{ backgroundColor: "rgba(59, 159, 231, 0.05)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ backgroundColor: "var(--cam-blue)" }}>
                  {round.round_number}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Round {round.round_number}</h3>
                  <p className="text-xs text-gray-500">
                    Launched {formatDate(round.launched_at)} &middot; Closes {formatDate(round.closes_at)}
                    {days !== null && ` (${days} day${days !== 1 ? "s" : ""} remaining)`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {round.active_alert_count > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                    {round.active_alert_count} Warning{round.active_alert_count !== 1 ? "s" : ""} in {round.alert_community_count} Communit{round.alert_community_count !== 1 ? "ies" : "y"}
                  </span>
                )}
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                  In Progress
                </span>
              </div>
            </div>

            <div className="px-6 py-4">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 font-medium">{responded} of {invited} responses</span>
                  <span className="text-gray-500">{progress}%</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: "var(--cam-blue)",
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate(`/admin/rounds/${round.id}`)}
                  className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
                  style={{ backgroundColor: "var(--cam-blue)" }}
                >
                  View Dashboard
                </button>
                {confirmClose === round.id ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCloseRound(round.id)}
                      disabled={closingRound === round.id}
                      className="py-2.5 px-4 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
                    >
                      {closingRound === round.id ? "Closing..." : "Yes, Close"}
                    </button>
                    <button
                      onClick={() => setConfirmClose(null)}
                      className="py-2.5 px-4 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClose(round.id)}
                    className="py-2.5 px-4 text-sm font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Close Early
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Completed Rounds */}
      {completedRounds.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Completed Rounds
          </h3>
          <div className="space-y-3">
            {completedRounds.map((round) => {
              const responded = round.responses_completed || 0;
              const invited = round.members_invited || 0;
              const rate = invited > 0 ? Math.round((responded / invited) * 100) : 0;

              return (
                <div
                  key={round.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:border-gray-300 transition cursor-pointer"
                  onClick={() => navigate(`/admin/rounds/${round.id}`)}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ backgroundColor: "var(--cam-green)" }}>
                    {round.round_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-gray-900">Round {round.round_number}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        Concluded
                      </span>
                      {round.active_alert_count > 0 && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          {round.active_alert_count} Warning{round.active_alert_count !== 1 ? "s" : ""}
                        </span>
                      )}
                      {round.insights_generated_at && (
                        <span className="text-xs text-gray-400" title="AI insights available">
                          <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatDate(round.launched_at)} — {formatDate(round.concluded_at)} &middot; {responded}/{invited} responses ({rate}%)
                    </p>
                  </div>
                  <span className="text-sm font-semibold px-4 py-1.5 rounded-lg text-white flex-shrink-0" style={{ backgroundColor: "var(--cam-green)" }}>
                    View Results
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Planned Rounds */}
      {plannedRounds.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Upcoming Rounds
          </h3>
          <SurveySchedule
            cadence={cadence}
            maxCadence={maxCadence}
            onCadenceChange={handleCadenceChange}
            cadenceUpdating={cadenceUpdating}
            cadenceMessage={cadenceMessage}
          />
        </div>
      )}

      {/* Member Limit Warning */}
      {memberLimit && memberCount > memberLimit && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">Board member limit exceeded</p>
              <p className="text-sm text-amber-700 mt-0.5">
                You have {memberCount} board members but your plan supports {memberLimit}. New survey rounds cannot be launched until you're within your plan limit. Remove inactive board members or upgrade your plan.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
