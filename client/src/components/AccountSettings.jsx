import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import AddAdminUserModal from "./AddAdminUserModal";
import ConfirmModal from "./ConfirmModal";
import TypedConfirmModal from "./TypedConfirmModal";

/**
 * /admin/account — full visual rebuild matching DESIGN/handoff/account-spec.md.
 *
 * Layout:
 *   - H1 "Account" + sub
 *   - Two-column grid: 220px sticky subnav + content
 *   - 8 sections grouped Workspace / Integrations / Personal
 *
 * EVERY existing handler, modal, and API call from the previous version is
 * preserved verbatim — only the presentation layer changed. Phase B will
 * fill in real backends for the stubbed sections (notifications, full
 * profile fields, 2FA + sessions, transfer/pause/export). For now those
 * sections render visual shells that flag "Coming soon" so the IA still
 * lines up with the spec.
 *
 * Detractor threshold per Mike: stays on its dedicated endpoint
 * `/api/admin/account/detractor-threshold`. The notif-row stepper visual
 * from the spec is mirrored in the Notifications section but bound to
 * that endpoint, not a future notif_preferences table.
 */
export default function AccountSettings() {
  // ── existing state (unchanged from prior version) ───────────────
  const [client, setClient] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saveMessage, setSaveMessage] = useState(null);
  const [adminError, setAdminError] = useState("");
  const [cadenceError, setCadenceError] = useState("");
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [subMessage, setSubMessage] = useState(null);
  const [removeAdminTarget, setRemoveAdminTarget] = useState(null);
  const [cadenceConfirm, setCadenceConfirm] = useState(null);
  const [googleReviewEnabled, setGoogleReviewEnabled] = useState(false);
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewMessage, setReviewMessage] = useState(null);
  const [locations, setLocations] = useState([]);
  const [locationUrls, setLocationUrls] = useState({});
  const [showLocationUrls, setShowLocationUrls] = useState(false);
  const [detractorThreshold, setDetractorThreshold] = useState(0);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [reviewThreshold, setReviewThreshold] = useState(9);
  const [savingReviewThreshold, setSavingReviewThreshold] = useState(false);
  const { user: sessionUser } = useOutletContext();

  // ── new: which subsection panel is active ───────────────────────
  const [activeSection, setActiveSection] = useState("org");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [clientRes, usersRes] = await Promise.all([
        fetch("/api/admin/account", { credentials: "include" }),
        fetch("/api/admin/users", { credentials: "include" }),
      ]);

      if (clientRes.ok) {
        const clientData = await clientRes.json();
        setClient(clientData);
        setCompanyName(clientData.company_name);
        setAddressLine1(clientData.address_line1 || "");
        setAddressLine2(clientData.address_line2 || "");
        setCity(clientData.city || "");
        setState(clientData.state || "");
        setZip(clientData.zip || "");
        setPhoneNumber(clientData.phone_number || "");
        setGoogleReviewEnabled(clientData.google_review_enabled || false);
        setGoogleReviewUrl(clientData.google_review_url || "");
        if (clientData.locations) {
          setLocations(clientData.locations);
          const urlMap = {};
          for (const loc of clientData.locations) {
            if (loc.google_review_url) urlMap[loc.id] = loc.google_review_url;
          }
          setLocationUrls(urlMap);
          setShowLocationUrls(Object.keys(urlMap).length > 0);
        }
        setDetractorThreshold(clientData.detractor_alert_threshold || 0);
        setReviewThreshold(
          Number.isInteger(clientData.google_review_threshold)
            ? clientData.google_review_threshold
            : 9
        );
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setAdminUsers(usersData);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error loading account data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          address_line1: addressLine1,
          address_line2: addressLine2,
          city,
          state,
          zip,
          phone_number: phoneNumber,
        }),
        credentials: "include",
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save");

      setSaveMessage({ type: "success", text: "Account information updated." });
      loadData();
    } catch (err) {
      setSaveMessage({ type: "error", text: "Failed to update account: " + err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUser = async (userId) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove user");
      }

      setAdminError("");
      loadData();
    } catch (err) {
      setAdminError(err.message);
    }
  };

  const handleCadenceChange = async (newCadence) => {
    setCadenceConfirm(null);
    const res = await fetch("/api/admin/account/cadence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey_cadence: newCadence }),
      credentials: "include",
    });
    if (res.ok) {
      await fetch("/api/admin/survey-rounds/recalculate", {
        method: "POST",
        credentials: "include",
      });
      loadData();
    } else {
      const data = await res.json();
      setCadenceError(data.error);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMessage(null);

    if (pwForm.newPw.length < 8) {
      setPwMessage({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.newPw }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      setPwMessage({ type: "success", text: "Password changed successfully." });
      setPwForm({ current: "", newPw: "", confirm: "" });
      setTimeout(() => setShowPwModal(false), 1200);
    } catch (err) {
      setPwMessage({ type: "error", text: err.message });
    } finally {
      setPwSaving(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");
      window.location.href = "/";
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleLogoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setLogoError("");

    const allowedTypes = ["image/png", "image/jpeg", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      setLogoError("Only PNG, JPG, and SVG files are accepted.");
      return;
    }
    if (file.size > 500 * 1024) {
      setLogoError("Logo must be under 500KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (file.type !== "image/svg+xml") {
        const img = new Image();
        img.onload = () => {
          const ratio = img.width / img.height;
          if (ratio < 0.8) {
            setLogoError("Portrait logos are not supported. Use a landscape or square image.");
            return;
          }
          if (ratio > 3) {
            setLogoError("Logo is too wide. Maximum aspect ratio is 3:1.");
            return;
          }
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
      setClient((prev) => ({ ...prev, has_logo: true }));
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await fetch("/api/admin/account/logo", { method: "DELETE", credentials: "include" });
      setLogoPreview(null);
      setClient((prev) => ({ ...prev, has_logo: false }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to remove logo:", err);
    }
  };

  const handleSaveReviewThreshold = async (value) => {
    const next = Math.max(7, Math.min(10, Math.round(Number(value) || 9)));
    setSavingReviewThreshold(true);
    try {
      const res = await fetch("/api/admin/account/google-review-threshold", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: next }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save");
      setReviewThreshold(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save review threshold:", err);
    } finally {
      setSavingReviewThreshold(false);
    }
  };

  const handleSaveDetractorThreshold = async (value) => {
    setSavingThreshold(true);
    try {
      const res = await fetch("/api/admin/account/detractor-threshold", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save");
      setDetractorThreshold(value);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save threshold:", err);
    } finally {
      setSavingThreshold(false);
    }
  };

  const handleSaveReviewSettings = async (overrides = {}) => {
    setReviewSaving(true);
    setReviewMessage(null);
    try {
      const payload = {
        enabled: overrides.enabled !== undefined ? overrides.enabled : googleReviewEnabled,
        url: overrides.url !== undefined ? overrides.url : googleReviewUrl,
        location_urls: locations.map((l) => ({
          location_id: l.id,
          google_review_url: locationUrls[l.id] || "",
        })),
      };
      const res = await fetch("/api/admin/account/google-review", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setReviewMessage({ type: "success", text: "Google Review settings saved." });
    } catch (err) {
      setReviewMessage({ type: "error", text: err.message });
    } finally {
      setReviewSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="text-center py-10" style={{ color: "var(--ink-4)" }}>
        Loading account information…
      </p>
    );
  }

  const sectionLabel = SECTIONS.find((s) => s.id === activeSection)?.label || "";

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--ink)" }}>
      <PageHeader sectionLabel={sectionLabel} />

      <div
        className="grid items-start"
        style={{ gridTemplateColumns: "220px 1fr", gap: 36, marginTop: 22 }}
      >
        <SubNav active={activeSection} onChange={setActiveSection} />

        <div className="flex flex-col" style={{ gap: 24, minWidth: 0 }}>
          {activeSection === "org" && (
            <OrgSection
              client={client}
              companyName={companyName}
              setCompanyName={setCompanyName}
              addressLine1={addressLine1}
              setAddressLine1={setAddressLine1}
              addressLine2={addressLine2}
              setAddressLine2={setAddressLine2}
              city={city}
              setCity={setCity}
              state={state}
              setState={setState}
              zip={zip}
              setZip={setZip}
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
              saving={saving}
              saveMessage={saveMessage}
              onSave={handleSave}
              logoPreview={logoPreview}
              logoUploading={logoUploading}
              logoError={logoError}
              onLogoSelect={handleLogoSelect}
              onRemoveLogo={handleRemoveLogo}
            />
          )}
          {activeSection === "team" && (
            <TeamSection
              users={adminUsers}
              currentEmail={sessionUser?.email}
              error={adminError}
              onInvite={() => setShowAddUserModal(true)}
              onEdit={loadData}
              onRemove={(target) => setRemoveAdminTarget(target)}
              onChangePassword={() => {
                setPwMessage(null);
                setPwForm({ current: "", newPw: "", confirm: "" });
                setShowPwModal(true);
              }}
            />
          )}
          {activeSection === "subscription" && (
            <SubscriptionSection
              client={client}
              cadenceError={cadenceError}
              setCadenceConfirm={setCadenceConfirm}
              subMessage={subMessage}
              setSubMessage={setSubMessage}
              loadData={loadData}
              setShowPlanModal={setShowPlanModal}
              setAvailablePlans={setAvailablePlans}
              setPlanError={setPlanError}
              setShowCancelModal={setShowCancelModal}
              setCancelError={setCancelError}
            />
          )}
          {activeSection === "reviews" && (
            <ReviewsSection
              enabled={googleReviewEnabled}
              setEnabled={setGoogleReviewEnabled}
              url={googleReviewUrl}
              setUrl={setGoogleReviewUrl}
              locations={locations}
              locationUrls={locationUrls}
              setLocationUrls={setLocationUrls}
              showLocationUrls={showLocationUrls}
              setShowLocationUrls={setShowLocationUrls}
              saving={reviewSaving}
              message={reviewMessage}
              onSave={handleSaveReviewSettings}
              threshold={reviewThreshold}
              savingThreshold={savingReviewThreshold}
              onSaveThreshold={handleSaveReviewThreshold}
            />
          )}
          {activeSection === "notifications" && (
            <NotificationsSection
              detractorThreshold={detractorThreshold}
              savingThreshold={savingThreshold}
              onSaveThreshold={handleSaveDetractorThreshold}
            />
          )}
          {activeSection === "profile" && (
            <ProfileSection
              user={sessionUser}
              currentEmail={sessionUser?.email}
              users={adminUsers}
              onChangePassword={() => {
                setPwMessage(null);
                setPwForm({ current: "", newPw: "", confirm: "" });
                setShowPwModal(true);
              }}
            />
          )}
          {activeSection === "security" && (
            <SecuritySection
              onChangePassword={() => {
                setPwMessage(null);
                setPwForm({ current: "", newPw: "", confirm: "" });
                setShowPwModal(true);
              }}
            />
          )}
          {activeSection === "danger" && (
            <DangerSection
              client={client}
              onDelete={() => {
                setDeletePassword("");
                setDeleteError("");
                setShowDeleteModal(true);
              }}
            />
          )}
        </div>
      </div>

      {/* ── modals (preserved from prior version) ─────────────────── */}

      {showPwModal && (
        <ChangePasswordModal
          pwForm={pwForm}
          setPwForm={setPwForm}
          pwSaving={pwSaving}
          pwMessage={pwMessage}
          onSubmit={handleChangePassword}
          onClose={() => setShowPwModal(false)}
        />
      )}

      {showPlanModal && (
        <ChangePlanModal
          plans={availablePlans}
          client={client}
          planError={planError}
          planLoading={planLoading}
          setPlanLoading={setPlanLoading}
          setPlanError={setPlanError}
          setSubMessage={setSubMessage}
          loadData={loadData}
          onClose={() => setShowPlanModal(false)}
        />
      )}

      {showCancelModal && (
        <CancelSubModal
          cancelLoading={cancelLoading}
          cancelError={cancelError}
          setCancelError={setCancelError}
          setCancelLoading={setCancelLoading}
          setSubMessage={setSubMessage}
          loadData={loadData}
          onClose={() => setShowCancelModal(false)}
        />
      )}

      {showDeleteModal && (
        <DeleteAccountModal
          companyName={client?.company_name}
          deletePassword={deletePassword}
          setDeletePassword={setDeletePassword}
          deleteError={deleteError}
          deleting={deleting}
          onSubmit={handleDeleteAccount}
          onClose={() => setShowDeleteModal(false)}
        />
      )}

      <AddAdminUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onAdd={loadData}
      />
      <TypedConfirmModal
        isOpen={!!removeAdminTarget}
        onClose={() => setRemoveAdminTarget(null)}
        onConfirm={async () => {
          await handleRemoveUser(removeAdminTarget?.id);
          setRemoveAdminTarget(null);
        }}
        title="Remove admin user"
        message="This admin will lose access to the account immediately. They can be re-invited later."
        confirmPhrase={removeAdminTarget?.email || ""}
        confirmLabel="Remove"
      />
      <ConfirmModal
        isOpen={!!cadenceConfirm}
        onClose={() => setCadenceConfirm(null)}
        onConfirm={() => handleCadenceChange(cadenceConfirm)}
        title="Change Survey Cadence"
        message="Changing your cadence will recalculate future planned rounds. Already launched rounds are not affected. Continue?"
        confirmLabel="Change Cadence"
      />

      <AccountStyles />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Page header — H1 + sub
// ──────────────────────────────────────────────────────────────────────

function PageHeader({ sectionLabel }) {
  return (
    <div>
      <div
        className="text-[11px] font-semibold uppercase mb-2"
        style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
      >
        {sectionLabel ? `Account · ${sectionLabel}` : "Account"}
      </div>
      <h1
        className="font-normal"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          color: "var(--ink)",
          letterSpacing: "-0.02em",
        }}
      >
        Account
      </h1>
      <p className="text-[13.5px] mt-1.5" style={{ color: "var(--ink-3)" }}>
        Manage your organization, billing, integrations, and personal preferences.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SubNav
// ──────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "org", label: "Organization", icon: "building", group: "Workspace" },
  { id: "team", label: "Admin users", icon: "users", group: "Workspace" },
  { id: "subscription", label: "Subscription", icon: "card", group: "Workspace" },
  { id: "reviews", label: "Google Reviews", icon: "star", group: "Integrations" },
  { id: "notifications", label: "Notifications", icon: "bell", group: "Integrations" },
  { id: "profile", label: "My profile", icon: "user", group: "Personal" },
  { id: "security", label: "Security", icon: "shield", group: "Personal" },
  { id: "danger", label: "Danger zone", icon: "trash", group: "Personal", danger: true },
];

function SubNav({ active, onChange }) {
  const groups = ["Workspace", "Integrations", "Personal"];
  return (
    <nav
      className="flex flex-col"
      style={{
        position: "sticky",
        top: 84,
        gap: 2,
        borderRight: "1px solid var(--line)",
        paddingRight: 12,
        alignSelf: "start",
      }}
    >
      {groups.map((g) => (
        <div key={g} className="flex flex-col" style={{ gap: 1 }}>
          <div
            className="text-[10.5px] font-semibold uppercase mb-1 mt-3 px-2"
            style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
          >
            {g}
          </div>
          {SECTIONS.filter((s) => s.group === g).map((s) => (
            <SubNavLink
              key={s.id}
              section={s}
              active={active === s.id}
              onClick={() => onChange(s.id)}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SubNavLink({ section, active, onClick }) {
  const danger = section.danger;
  const baseColor = danger ? "var(--coral)" : "var(--ink-2)";
  const activeColor = danger ? "var(--coral)" : "var(--ink)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 text-left transition"
      style={{
        padding: "8px 10px",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? activeColor : baseColor,
        backgroundColor: active ? "var(--paper-2)" : "transparent",
        boxShadow: active ? `inset 2px 0 0 ${danger ? "var(--coral)" : "var(--pulse)"}` : "none",
        borderRadius: 6,
        border: 0,
        cursor: "pointer",
      }}
    >
      <span style={{ width: 14, height: 14, color: "currentColor" }}>
        <Ico name={section.icon} size={14} />
      </span>
      {section.label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Card primitives
// ──────────────────────────────────────────────────────────────────────

function Card({ children, danger = false, style = {} }) {
  return (
    <div
      className="rounded-2xl bg-white"
      style={{
        border: `1px solid ${danger ? "var(--coral-soft, #f1c8bd)" : "var(--line)"}`,
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ title, sub, right, danger = false, icon = null }) {
  return (
    <div
      className="flex items-start justify-between"
      style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--line)",
        backgroundColor: danger ? "var(--coral-tint, #fdecea)" : "white",
      }}
    >
      <div className="min-w-0">
        <div
          className="font-semibold flex items-center gap-2"
          style={{
            fontSize: 13.5,
            color: danger ? "var(--coral)" : "var(--ink)",
            letterSpacing: "-0.005em",
          }}
        >
          {icon && (
            <span style={{ width: 14, height: 14 }}>
              <Ico name={icon} size={14} />
            </span>
          )}
          {title}
        </div>
        {sub && (
          <div className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)" }}>
            {sub}
          </div>
        )}
      </div>
      {right && <div className="flex-shrink-0 ml-4">{right}</div>}
    </div>
  );
}

function CardBody({ children, style = {} }) {
  return <div style={{ padding: "20px 24px", ...style }}>{children}</div>;
}

function CardFooter({ meta, actions }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "12px 24px",
        backgroundColor: "var(--paper-2)",
        borderTop: "1px solid var(--line)",
      }}
    >
      <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {meta}
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

function SectionHeading({ title, sub, action }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2
          className="font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
        {sub && (
          <div className="text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
            {sub}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

function FieldLabel({ label, hint, children, full = false }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <label
        className="block mb-1.5 font-semibold"
        style={{ fontSize: 11.5, color: "var(--ink-2)" }}
      >
        {label}
        {hint && (
          <span className="font-normal ml-1" style={{ color: "var(--ink-4)" }}>
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function Pill({ tone = "neutral", children }) {
  const tones = {
    good: { bg: "var(--pulse-tint)", color: "var(--pulse-deep)" },
    warn: { bg: "var(--amber-tint)", color: "var(--amber, #B97A1F)" },
    danger: { bg: "var(--coral-tint, #fdecea)", color: "var(--coral)" },
    ai: { bg: "var(--plum-tint, #ece8f5)", color: "var(--plum, #6B4FBB)" },
    neutral: { bg: "var(--paper-3, #ECECEA)", color: "var(--ink-2)" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full"
      style={{
        backgroundColor: t.bg,
        color: t.color,
        fontSize: 10.5,
        fontWeight: 600,
        padding: "3px 8px",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </span>
  );
}

function Btn({ variant = "ghost", onClick, disabled, type = "button", children, style = {} }) {
  const variants = {
    pulse: {
      backgroundColor: "var(--pulse)",
      color: "white",
      border: "1px solid var(--pulse)",
    },
    primary: {
      backgroundColor: "var(--ink)",
      color: "white",
      border: "1px solid var(--ink)",
    },
    ghost: {
      backgroundColor: "white",
      color: "var(--ink)",
      border: "1px solid var(--line-2)",
    },
    danger: {
      backgroundColor: "var(--coral)",
      color: "white",
      border: "1px solid var(--coral)",
    },
    "danger-ghost": {
      backgroundColor: "white",
      color: "var(--coral)",
      border: "1px solid var(--coral-soft, #f1c8bd)",
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="font-semibold rounded-lg transition disabled:opacity-50"
      style={{
        padding: "8px 14px",
        fontSize: 12.5,
        ...variants[variant],
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 1. Organization
// ──────────────────────────────────────────────────────────────────────

function OrgSection(props) {
  const {
    client,
    companyName,
    setCompanyName,
    addressLine1,
    setAddressLine1,
    addressLine2,
    setAddressLine2,
    city,
    setCity,
    state,
    setState,
    zip,
    setZip,
    phoneNumber,
    setPhoneNumber,
    saving,
    saveMessage,
    onSave,
    logoPreview,
    logoUploading,
    logoError,
    onLogoSelect,
    onRemoveLogo,
  } = props;

  const updatedMeta = client?.updated_at
    ? `Last updated ${formatRelative(client.updated_at)}`
    : "Last updated just now";

  return (
    <>
      <SectionHeading
        title="Organization"
        sub="The company profile that appears on surveys, invitations, and the resident chat."
      />

      <Card>
        <CardHeader
          title="Company information"
          sub="Used in survey invitations and the resident chat header."
          right={
            <Pill tone="good">
              <CheckIcon /> Active
            </Pill>
          }
        />
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14 }}>
            <FieldLabel label="Company name">
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="rp-input"
              />
            </FieldLabel>
            <FieldLabel label="Phone number">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="rp-input"
                placeholder="(555) 123-4567"
              />
            </FieldLabel>
            <FieldLabel label="Address line 1" full>
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                className="rp-input"
                placeholder="100 Main Street"
              />
            </FieldLabel>
            <FieldLabel label="Address line 2" hint="(optional)" full>
              <input
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                className="rp-input"
                placeholder="Apartment, suite, etc."
              />
            </FieldLabel>
            <FieldLabel label="City">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="rp-input"
                placeholder="Safety Harbor"
              />
            </FieldLabel>
            <div
              className="grid"
              style={{ gridTemplateColumns: "1fr 1fr", gap: 12, alignSelf: "end" }}
            >
              <FieldLabel label="State">
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  className="rp-input"
                  maxLength={2}
                  placeholder="FL"
                />
              </FieldLabel>
              <FieldLabel label="ZIP code">
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  className="rp-input"
                  maxLength={10}
                  placeholder="34695"
                />
              </FieldLabel>
            </div>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-3"
            style={{
              gap: 16,
              marginTop: 22,
              paddingTop: 22,
              borderTop: "1px solid var(--line)",
            }}
          >
            <ReadOnlyField label="Client ID" value={client?.client_code || `cust_${client?.id}`} />
            <ReadOnlyField
              label="Status"
              value={
                <Pill tone={client?.status === "active" ? "good" : "warn"}>
                  <CheckIcon size={9} /> {client?.status || "—"}
                </Pill>
              }
            />
            <ReadOnlyField
              label="Customer since"
              value={
                client?.created_at
                  ? new Date(client.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"
              }
            />
          </div>
        </CardBody>
        <CardFooter
          meta={updatedMeta}
          actions={
            <>
              {saveMessage && (
                <span
                  className="self-center text-[12px] mr-2"
                  style={{
                    color: saveMessage.type === "success" ? "var(--pulse-deep)" : "var(--coral)",
                  }}
                >
                  {saveMessage.text}
                </span>
              )}
              <Btn variant="pulse" onClick={onSave} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Btn>
            </>
          }
        />
      </Card>

      <Card>
        <CardHeader
          title="Company logo"
          sub="Appears in the survey header and invitation emails."
        />
        <CardBody>
          <div className="flex items-start gap-5">
            <LogoThumb
              logoPreview={logoPreview}
              hasLogo={client?.has_logo}
              fallback={companyName}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                {client?.has_logo || logoPreview ? "Current logo" : "No logo uploaded"}
              </div>
              <div className="text-[11.5px] mt-1" style={{ color: "var(--ink-4)" }}>
                PNG, JPG, or SVG · Max 500KB · Square format recommended (512×512+)
              </div>
              <div className="flex gap-2 mt-3">
                <label
                  className="font-semibold rounded-lg cursor-pointer transition"
                  style={{
                    padding: "8px 14px",
                    fontSize: 12.5,
                    backgroundColor: "white",
                    color: "var(--ink)",
                    border: "1px solid var(--line-2)",
                  }}
                >
                  {logoUploading
                    ? "Uploading…"
                    : client?.has_logo || logoPreview
                      ? "Replace"
                      : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={onLogoSelect}
                    disabled={logoUploading}
                    className="hidden"
                  />
                </label>
                {(client?.has_logo || logoPreview) && (
                  <Btn variant="ghost" onClick={onRemoveLogo} style={{ color: "var(--coral)" }}>
                    Remove
                  </Btn>
                )}
              </div>
              {logoError && (
                <p className="text-[11.5px] mt-2" style={{ color: "var(--coral)" }}>
                  {logoError}
                </p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function LogoThumb({ logoPreview, hasLogo, fallback }) {
  const initial = (fallback || "?").trim().charAt(0).toUpperCase();
  if (logoPreview || hasLogo) {
    return (
      <div
        className="rounded-xl overflow-hidden flex items-center justify-center"
        style={{
          width: 88,
          height: 88,
          backgroundColor: "var(--paper-2)",
          border: "1px solid var(--line)",
        }}
      >
        <img
          src={logoPreview || "/api/admin/account/logo"}
          alt="Company logo"
          style={{ maxWidth: "80%", maxHeight: "80%", objectFit: "contain" }}
        />
      </div>
    );
  }
  return (
    <div
      className="rounded-xl flex items-center justify-center"
      style={{
        width: 88,
        height: 88,
        backgroundColor: "var(--ink)",
        background:
          "radial-gradient(circle at 50% 130%, rgba(31,165,113,0.55), transparent 65%), var(--ink)",
        color: "white",
        fontFamily: "var(--font-display)",
        fontSize: 36,
        fontWeight: 500,
      }}
    >
      {initial}
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <div
        className="text-[10.5px] font-semibold uppercase"
        style={{ letterSpacing: "0.1em", color: "var(--ink-4)", marginBottom: 6 }}
      >
        {label}
      </div>
      <div
        className="text-[13px]"
        style={{ color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}
      >
        {value}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2. Admin users
// ──────────────────────────────────────────────────────────────────────

function TeamSection({ users, currentEmail, error, onInvite, onEdit, onRemove, onChangePassword }) {
  return (
    <>
      <SectionHeading
        title="Admin users"
        sub="People at your company who can sign in to ResidentPulse."
        action={
          <Btn variant="pulse" onClick={onInvite}>
            + Invite admin
          </Btn>
        }
      />
      <Card>
        {error && (
          <div
            className="px-6 py-3 text-[12.5px]"
            style={{ color: "var(--coral)", borderBottom: "1px solid var(--line)" }}
          >
            {error}
          </div>
        )}
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--paper-2)" }}>
              <Th>Person</Th>
              <Th>Role</Th>
              <Th>Last active</Th>
              <Th>Joined</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-10 text-[13px]"
                  style={{ color: "var(--ink-4)" }}
                >
                  No admin users found.
                </td>
              </tr>
            )}
            {users.map((u, i) => (
              <TeamRow
                key={u.id}
                user={u}
                isYou={currentEmail && u.email === currentEmail}
                isLast={i === users.length - 1}
                onSaved={onEdit}
                onRemove={onRemove}
                onChangePassword={onChangePassword}
              />
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Th({ children, align = "left" }) {
  return (
    <th
      className="text-[10.5px] font-semibold uppercase"
      style={{
        letterSpacing: "0.1em",
        color: "var(--ink-4)",
        padding: "10px 16px",
        textAlign: align,
        borderBottom: "1px solid var(--line)",
      }}
    >
      {children}
    </th>
  );
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #F08672, #F2C28A)",
  "linear-gradient(135deg, #F2C28A, #E89E5A)",
  "linear-gradient(135deg, #6FA8E3, #4F7DBE)",
  "linear-gradient(135deg, #B79FE3, #856ECC)",
];

function TeamRow({ user, isYou, isLast, onSaved, onRemove, onChangePassword }) {
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(user.first_name || "");
  const [last, setLast] = useState(user.last_name || "");
  const [saving, setSaving] = useState(false);

  const initials = (
    (user.first_name?.[0] || user.email?.[0] || "?") + (user.last_name?.[0] || "")
  ).toUpperCase();
  const avaIdx =
    Math.abs((user.email || "").split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) %
    AVATAR_GRADIENTS.length;
  const fullName = user.first_name
    ? `${user.first_name} ${user.last_name || ""}`.trim()
    : user.email;

  const startEdit = () => {
    setFirst(user.first_name || "");
    setLast(user.last_name || "");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: first, last_name: last }),
        credentials: "include",
      });
      if (res.ok) {
        setEditing(false);
        if (onSaved) onSaved();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to update user:", err);
    } finally {
      setSaving(false);
    }
  };

  const cellStyle = {
    padding: "14px 16px",
    borderBottom: isLast ? "none" : "1px solid var(--line)",
    fontSize: 12.5,
    verticalAlign: "middle",
  };

  return (
    <tr style={{ transition: "background-color 100ms" }}>
      <td style={cellStyle}>
        <div className="flex items-center gap-3">
          <div
            className="rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              width: 32,
              height: 32,
              background: AVATAR_GRADIENTS[avaIdx],
              color: "white",
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            {editing ? (
              <div className="flex gap-1.5">
                <input
                  className="rp-input"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  placeholder="First"
                  style={{ width: 100 }}
                  autoFocus
                />
                <input
                  className="rp-input"
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                  placeholder="Last"
                  style={{ width: 100 }}
                />
              </div>
            ) : (
              <>
                <div
                  className="font-semibold flex items-center gap-2"
                  style={{ color: "var(--ink)" }}
                >
                  {fullName}
                  {isYou && <Pill tone="neutral">YOU</Pill>}
                </div>
                <div className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                  {user.email}
                </div>
              </>
            )}
          </div>
        </div>
      </td>
      <td style={cellStyle}>
        <span
          className="inline-flex font-semibold rounded"
          style={{
            padding: "3px 8px",
            fontSize: 10.5,
            backgroundColor: isYou ? "var(--ink)" : "var(--paper-3, #ECECEA)",
            color: isYou ? "white" : "var(--ink-2)",
            letterSpacing: "0.02em",
          }}
        >
          {isYou ? "Owner" : "Admin"}
        </span>
      </td>
      <td
        style={{
          ...cellStyle,
          color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
        }}
      >
        —
      </td>
      <td
        style={{
          ...cellStyle,
          color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {user.created_at
          ? new Date(user.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—"}
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>
        {editing ? (
          <div className="flex gap-2 justify-end">
            <Btn variant="pulse" onClick={handleSave} disabled={saving}>
              {saving ? "…" : "Save"}
            </Btn>
            <Btn variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Btn>
          </div>
        ) : (
          <div className="flex gap-3 justify-end">
            <ActionLink onClick={startEdit}>Edit</ActionLink>
            {isYou && <ActionLink onClick={onChangePassword}>Reset password</ActionLink>}
            {!isYou && (
              <ActionLink danger onClick={() => onRemove({ id: user.id, email: user.email })}>
                Remove
              </ActionLink>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function ActionLink({ children, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12.5px] font-semibold transition"
      style={{
        color: danger ? "var(--coral)" : "var(--pulse-deep)",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3. Subscription
// ──────────────────────────────────────────────────────────────────────

function SubscriptionSection(props) {
  const {
    client,
    cadenceError,
    setCadenceConfirm,
    subMessage,
    setSubMessage,
    loadData,
    setShowPlanModal,
    setAvailablePlans,
    setPlanError,
    setShowCancelModal,
    setCancelError,
  } = props;

  const sub = client?.subscription;
  const usage = client?.usage || {};
  const memberLimit = sub?.member_limit || 1;
  const memberCount = usage.member_count || 0;
  const memberPct = Math.min(100, (memberCount / memberLimit) * 100);
  const cadence = sub?.survey_cadence || sub?.survey_rounds_per_year || 2;
  const roundsUsed = usage.survey_rounds_used || 0;
  const roundsPct = Math.min(100, (roundsUsed / cadence) * 100);

  const renewLabel = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <>
      <SectionHeading
        title="Subscription"
        sub="Plan, usage, and billing — managed through Zoho. Changes there sync here automatically."
        action={
          <Btn variant="ghost" onClick={() => alert("Open Zoho billing portal")}>
            Manage in Zoho ↗
          </Btn>
        }
      />

      {!sub && (
        <Card>
          <CardBody>
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              No subscription information available. Contact support for assistance.
            </p>
          </CardBody>
        </Card>
      )}

      {sub && (
        <>
          {subMessage && (
            <div
              className="rounded-xl px-4 py-3 text-[12.5px]"
              style={{
                backgroundColor: "var(--pulse-tint)",
                color: "var(--pulse-deep)",
                border: "1px solid var(--pulse-soft, #c8e7d8)",
              }}
            >
              {subMessage}
            </div>
          )}

          <Card>
            <CardBody>
              <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]" style={{ gap: 28 }}>
                <div>
                  <Eyebrow>Current plan</Eyebrow>
                  <div
                    className="font-medium mt-1"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 26,
                      letterSpacing: "-0.015em",
                      color: "var(--ink)",
                    }}
                  >
                    {sub.plan_display_name}
                    {sub.price_cents > 0 && (
                      <small
                        className="font-normal ml-2"
                        style={{ fontSize: 14, color: "var(--ink-3)" }}
                      >
                        (${(sub.price_cents / 100).toLocaleString()} / month)
                      </small>
                    )}
                  </div>
                  <div className="text-[12.5px] mt-1.5" style={{ color: "var(--ink-3)" }}>
                    {sub.cancel_at_period_end
                      ? `Cancels ${renewLabel} · downgrades to Free`
                      : sub.price_cents > 0
                        ? `Renews ${renewLabel}`
                        : `${memberLimit.toLocaleString()} board members included`}
                  </div>

                  <div className="mt-5 flex flex-col" style={{ gap: 14 }}>
                    <UsageBar
                      label="Board members used"
                      current={memberCount.toLocaleString()}
                      total={memberLimit.toLocaleString()}
                      pct={memberPct}
                      tone={memberPct > 90 ? "warn" : "good"}
                    />
                    <UsageBar
                      label="Survey rounds this year"
                      current={roundsUsed.toString()}
                      total={cadence.toString()}
                      pct={roundsPct}
                      tone="ink"
                    />
                  </div>
                </div>

                <div>
                  <Eyebrow>Plan limits</Eyebrow>
                  <div
                    className="rounded-xl mt-2"
                    style={{
                      backgroundColor: "var(--paper-2)",
                      border: "1px solid var(--line)",
                      padding: 16,
                    }}
                  >
                    <DivRow label="Member limit" value={memberLimit.toLocaleString()} mono />
                    <DivRow label="Rounds / year" value={sub.survey_rounds_per_year} mono divider />
                    <DivRow
                      label="Plan status"
                      value={
                        <Pill
                          tone={
                            sub.cancel_at_period_end
                              ? "warn"
                              : sub.status === "active"
                                ? "good"
                                : "neutral"
                          }
                        >
                          {sub.cancel_at_period_end ? "Cancels soon" : sub.status}
                        </Pill>
                      }
                      divider
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 22,
                  paddingTop: 22,
                  borderTop: "1px solid var(--line)",
                }}
              >
                <Eyebrow>Survey cadence</Eyebrow>
                <p className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)" }}>
                  How many times per year you survey your board members. Changing cadence
                  recalculates future planned rounds.
                </p>
                <div className="flex gap-2 mt-3">
                  <CadenceBtn
                    active={cadence === 2}
                    onClick={() => cadence !== 2 && setCadenceConfirm(2)}
                  >
                    2× / year
                  </CadenceBtn>
                  <CadenceBtn
                    active={cadence === 4}
                    disabled={sub.survey_rounds_per_year < 4}
                    title={
                      sub.survey_rounds_per_year < 4
                        ? "Upgrade your plan to enable quarterly surveys"
                        : ""
                    }
                    onClick={() => cadence !== 4 && setCadenceConfirm(4)}
                  >
                    4× / year
                  </CadenceBtn>
                </div>
                {cadenceError && (
                  <p className="text-[12px] mt-2" style={{ color: "var(--coral)" }}>
                    {cadenceError}
                  </p>
                )}
                {sub.survey_rounds_per_year < 4 && (
                  <p className="text-[11.5px] mt-1" style={{ color: "var(--ink-4)" }}>
                    Quarterly surveys available on Starter plan and above.
                  </p>
                )}
              </div>
            </CardBody>
            <CardFooter
              meta="Plan, usage, and billing details mirror Zoho."
              actions={
                sub.cancel_at_period_end ? (
                  <Btn
                    variant="ghost"
                    onClick={async () => {
                      setSubMessage(null);
                      try {
                        const res = await fetch("/api/admin/account/subscription/reactivate", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setSubMessage(data.message);
                          loadData();
                        } else {
                          setSubMessage(data.error);
                        }
                      } catch {
                        setSubMessage("Failed to reactivate. Please try again.");
                      }
                    }}
                    style={{ color: "var(--amber, #B97A1F)" }}
                  >
                    Undo cancellation
                  </Btn>
                ) : (
                  <>
                    <Btn
                      variant="ghost"
                      onClick={async () => {
                        setPlanError("");
                        setShowPlanModal(true);
                        const res = await fetch("/api/admin/account/subscription/plans", {
                          credentials: "include",
                        });
                        if (res.ok) setAvailablePlans(await res.json());
                      }}
                    >
                      Change plan
                    </Btn>
                    {sub.plan_name !== "free" && (
                      <Btn
                        variant="danger-ghost"
                        onClick={() => {
                          setCancelError("");
                          setShowCancelModal(true);
                        }}
                      >
                        Cancel subscription
                      </Btn>
                    )}
                  </>
                )
              }
            />
          </Card>

          <Card>
            <CardHeader
              title="Recent invoices"
              sub="Available in your Zoho billing portal."
              right={
                <a
                  className="text-[12px] font-semibold"
                  href="#"
                  style={{ color: "var(--pulse-deep)" }}
                >
                  View all in Zoho ↗
                </a>
              }
            />
            <CardBody>
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                Invoice history is read-through from Zoho. We'll surface the last few here once that
                link is wired — for now, click <strong>View all in Zoho ↗</strong> above.
              </p>
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}

function Eyebrow({ children }) {
  return (
    <div
      className="text-[10.5px] font-semibold uppercase"
      style={{ letterSpacing: "0.12em", color: "var(--ink-4)" }}
    >
      {children}
    </div>
  );
}

function UsageBar({ label, current, total, pct, tone = "good" }) {
  const fillColor =
    tone === "warn" ? "var(--coral)" : tone === "ink" ? "var(--ink-4)" : "var(--pulse)";
  return (
    <div>
      <div
        className="flex items-baseline justify-between mb-1.5"
        style={{ fontSize: 12.5, color: "var(--ink-3)" }}
      >
        <span>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>
          <strong style={{ color: "var(--ink)" }}>{current}</strong> / {total}
        </span>
      </div>
      <div
        className="rounded-full overflow-hidden"
        style={{ height: 6, backgroundColor: "var(--paper-3, #ECECEA)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: fillColor }}
        />
      </div>
    </div>
  );
}

function DivRow({ label, value, mono, divider }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "10px 0",
        borderTop: divider ? "1px solid var(--line)" : "none",
        fontSize: 12.5,
      }}
    >
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <span
        style={{
          color: "var(--ink)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CadenceBtn({ children, active, disabled, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="font-semibold rounded-lg transition disabled:opacity-50"
      style={{
        padding: "8px 16px",
        fontSize: 12.5,
        backgroundColor: active ? "var(--ink)" : "var(--paper-2)",
        color: active ? "white" : "var(--ink-2)",
        border: active ? "1px solid var(--ink)" : "1px solid var(--line-2)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 4. Google Reviews
// ──────────────────────────────────────────────────────────────────────

function ReviewsSection(props) {
  const {
    enabled,
    setEnabled,
    url,
    setUrl,
    locations,
    locationUrls,
    setLocationUrls,
    showLocationUrls,
    setShowLocationUrls,
    saving,
    message,
    onSave,
    threshold,
    savingThreshold,
    onSaveThreshold,
  } = props;

  return (
    <>
      <SectionHeading
        title="Google Reviews"
        sub={`Residents who score ${threshold} or higher are invited to leave a Google review at the end of their conversation.`}
      />
      <Card>
        <CardBody>
          <div className="flex items-start gap-4">
            <Toggle
              checked={enabled}
              onChange={(v) => {
                setEnabled(v);
                onSave({ enabled: v });
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[14px]" style={{ color: "var(--ink)" }}>
                Prompt promoters to leave a Google review
              </div>
              <div className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)" }}>
                A link appears on the survey completion screen for promoters.
              </div>
            </div>
            <div
              className="flex items-center gap-2 flex-shrink-0"
              title="Minimum NPS score that triggers the review ask"
            >
              <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                Score ≥
              </span>
              <ThresholdStepper
                value={threshold}
                min={7}
                max={10}
                disabled={savingThreshold || !enabled}
                onChange={onSaveThreshold}
              />
            </div>
          </div>

          <div
            style={{
              paddingTop: 18,
              marginTop: 18,
              borderTop: "1px solid var(--line)",
            }}
          >
            <FieldLabel label="Default review URL">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="rp-input"
                placeholder="https://www.cam-ascent.com"
              />
              <p className="text-[11.5px] mt-1.5" style={{ color: "var(--ink-4)" }}>
                Used for all promoters unless a community-specific URL below applies.
              </p>
            </FieldLabel>

            {locations.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setShowLocationUrls(!showLocationUrls)}
                  className="font-semibold text-[12.5px]"
                  style={{ color: "var(--pulse-deep)", border: 0, background: "transparent" }}
                >
                  {showLocationUrls ? "▾" : "▸"} Per-location overrides ({locations.length})
                </button>
                {showLocationUrls && (
                  <div className="flex flex-col mt-3" style={{ gap: 10 }}>
                    {locations.map((loc) => (
                      <div
                        key={loc.id}
                        className="grid items-center"
                        style={{ gridTemplateColumns: "200px 1fr auto", gap: 10 }}
                      >
                        <div>
                          <div
                            className="font-semibold text-[13px] truncate"
                            style={{ color: "var(--ink)" }}
                            title={loc.name}
                          >
                            {loc.name}
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--ink-4)" }}>
                            {loc.community_count || 0} communities
                          </div>
                        </div>
                        <input
                          type="url"
                          value={locationUrls[loc.id] || ""}
                          onChange={(e) =>
                            setLocationUrls({ ...locationUrls, [loc.id]: e.target.value })
                          }
                          className="rp-input"
                          placeholder="Uses default URL"
                        />
                        <Btn
                          variant="ghost"
                          onClick={() => {
                            const u = locationUrls[loc.id];
                            if (u) window.open(u, "_blank");
                          }}
                        >
                          Test
                        </Btn>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardBody>
        <CardFooter
          meta={enabled ? "Live for all rounds" : "Disabled — no review prompts will be sent"}
          actions={
            <>
              {message && (
                <span
                  className="self-center text-[12px] mr-2"
                  style={{
                    color: message.type === "success" ? "var(--pulse-deep)" : "var(--coral)",
                  }}
                >
                  {message.text}
                </span>
              )}
              <Btn variant="pulse" onClick={() => onSave()} disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </Btn>
            </>
          }
        />
      </Card>
    </>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative rounded-full transition"
      style={{
        width: 38,
        height: 22,
        backgroundColor: checked ? "var(--pulse)" : "var(--line-2)",
        border: 0,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span
        className="absolute rounded-full bg-white transition"
        style={{
          width: 18,
          height: 18,
          top: 2,
          left: checked ? 18 : 2,
          boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
        }}
      />
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 5. Notifications — partial: detractor threshold wired, rest stubbed
// ──────────────────────────────────────────────────────────────────────

function NotificationsSection({ detractorThreshold, savingThreshold, onSaveThreshold }) {
  return (
    <>
      <SectionHeading
        title="Notifications"
        sub="Decide what gets pushed to your team and through which channel. Personal preferences live in your profile."
      />
      <Card>
        <CardHeader
          title="Real-time alerts"
          sub="Sent the moment a survey response triggers them."
          icon="bell"
        />
        <CardBody>
          <NotifRow
            title="Detractor alert"
            sub="Get an email notification when a board member gives a low score, so you can follow up quickly."
            extra={
              <DetractorThresholdStepper
                value={detractorThreshold}
                saving={savingThreshold}
                onChange={onSaveThreshold}
              />
            }
            channels={["Email"]}
          />
          <NotifRow
            title="Critical issue mentioned"
            sub="AI detected language about lawsuits, safety, board turnover, or contract termination."
            extra={<Pill tone="ai">AI</Pill>}
            channels={["Email"]}
          />
          <NotifRow
            title="Round completed"
            sub="Sent when a survey round closes and final results are ready to review."
            channels={["Email"]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Digests"
          sub="Periodic rollups of activity across your portfolio."
          icon="chart"
        />
        <CardBody>
          <NotifRow
            title="Weekly portfolio digest"
            sub="Every Monday — response rate, NPS movement, top emerging concerns."
            channels={["Email"]}
          />
          <NotifRow
            title="Renewal risk report"
            sub="Monthly list of communities flagged at risk based on sentiment and contract date."
            channels={["Email"]}
          />
        </CardBody>
      </Card>

      <ComingSoonNote>
        Per-row enable/disable and digest scheduling ship in Phase B. Detractor threshold above is
        fully live today.
      </ComingSoonNote>
    </>
  );
}

function NotifRow({ title, sub, extra, channels = [] }) {
  return (
    <div
      className="flex items-start justify-between gap-4"
      style={{ padding: "14px 0", borderTop: "1px solid var(--line)" }}
    >
      <div className="min-w-0">
        <div className="font-semibold text-[13px]" style={{ color: "var(--ink)" }}>
          {title}
        </div>
        <div className="text-[12px] mt-1" style={{ color: "var(--ink-3)" }}>
          {sub}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {extra}
        {channels.includes("Email") && <ChannelTag>Email</ChannelTag>}
      </div>
    </div>
  );
}

function ChannelTag({ children }) {
  return (
    <span
      className="inline-flex items-center rounded-md"
      style={{
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: "var(--paper-2)",
        color: "var(--ink-2)",
        border: "1px solid var(--line)",
      }}
    >
      {children}
    </span>
  );
}

// Generic min..max integer stepper, used by Google review threshold
// (and ready for any future threshold control). Single onChange call
// with the new clamped value; parent handles persistence.
function ThresholdStepper({ value, min, max, disabled, onChange }) {
  const safe = Number.isInteger(value) ? value : min;
  return (
    <div
      className="inline-flex items-center"
      style={{
        backgroundColor: "white",
        border: "1px solid var(--line-2)",
        borderRadius: 6,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <StepperBtn
        onClick={() => onChange(Math.max(min, safe - 1))}
        disabled={disabled || safe <= min}
      >
        −
      </StepperBtn>
      <span
        className="text-center"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ink)",
          minWidth: 28,
        }}
      >
        {safe}
      </span>
      <StepperBtn
        onClick={() => onChange(Math.min(max, safe + 1))}
        disabled={disabled || safe >= max}
      >
        +
      </StepperBtn>
    </div>
  );
}

function DetractorThresholdStepper({ value, saving, onChange }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-lg"
      style={{
        backgroundColor: "var(--paper-2)",
        border: "1px solid var(--line)",
        padding: "4px 8px",
        fontSize: 11.5,
        color: "var(--ink-3)",
      }}
    >
      Score &lt;
      <div
        className="inline-flex items-center"
        style={{
          backgroundColor: "white",
          border: "1px solid var(--line-2)",
          borderRadius: 6,
        }}
      >
        <StepperBtn
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={saving || value <= 0}
        >
          −
        </StepperBtn>
        <span
          className="text-center"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ink)",
            minWidth: 28,
          }}
        >
          {value === 0 ? "Off" : value}
        </span>
        <StepperBtn
          onClick={() => onChange(Math.min(7, value + 1))}
          disabled={saving || value >= 7}
        >
          +
        </StepperBtn>
      </div>
    </span>
  );
}

function StepperBtn({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 22,
        height: 22,
        background: "transparent",
        border: 0,
        color: "var(--ink-3)",
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function ComingSoonNote({ children }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-[12px]"
      style={{
        backgroundColor: "var(--paper-2)",
        border: "1px dashed var(--line-2)",
        color: "var(--ink-3)",
      }}
    >
      <strong style={{ color: "var(--ink-2)" }}>Phase B preview · </strong>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 6. My profile — minimal until Phase B (timezone/job_title/etc. land)
// ──────────────────────────────────────────────────────────────────────

function ProfileSection({ user, currentEmail, users, onChangePassword }) {
  const me = users.find((u) => u.email === currentEmail) || {};
  const initials = (
    (me.first_name?.[0] || me.email?.[0] || "?") + (me.last_name?.[0] || "")
  ).toUpperCase();
  const fullName = me.first_name ? `${me.first_name} ${me.last_name || ""}`.trim() : me.email || "";

  return (
    <>
      <SectionHeading
        title="My profile"
        sub="Your personal account — separate from your organization's settings."
      />
      <Card>
        <CardHeader
          title="Personal information"
          sub="Edit your name in the Admin users table for now. Job title, time zone, and date format land in Phase B."
        />
        <CardBody>
          <div className="flex items-start gap-6">
            <div className="flex flex-col items-center" style={{ gap: 8, flexShrink: 0 }}>
              <div
                className="rounded-full flex items-center justify-center"
                style={{
                  width: 72,
                  height: 72,
                  background: AVATAR_GRADIENTS[0],
                  color: "white",
                  fontFamily: "var(--font-display)",
                  fontSize: 26,
                  fontWeight: 600,
                }}
              >
                {initials}
              </div>
              <div className="text-[11px]" style={{ color: "var(--ink-4)" }}>
                Photo upload soon
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <ReadOnlyField label="Name" value={fullName || "—"} />
              <div style={{ height: 14 }} />
              <ReadOnlyField label="Email" value={me.email || user?.email || "—"} />
              <div style={{ height: 14 }} />
              <ReadOnlyField
                label="Member since"
                value={
                  me.created_at
                    ? new Date(me.created_at).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"
                }
              />
              <div style={{ marginTop: 22 }}>
                <Btn variant="ghost" onClick={onChangePassword}>
                  Change password
                </Btn>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
      <ComingSoonNote>
        Job title, phone, time zone, date format, and per-user notification overrides ship in Phase
        B once `client_admins` schema is extended.
      </ComingSoonNote>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 7. Security — password wired, 2FA + sessions stubbed
// ──────────────────────────────────────────────────────────────────────

function SecuritySection({ onChangePassword }) {
  return (
    <>
      <SectionHeading
        title="Security"
        sub="Password, two-factor authentication, and active sessions."
      />
      <Card>
        <CardHeader
          title="Password"
          sub="Use a password you don't reuse anywhere else."
          right={
            <Btn variant="ghost" onClick={onChangePassword}>
              Change password
            </Btn>
          }
        />
      </Card>
      <Card>
        <CardHeader
          title="Two-factor authentication"
          sub="Add an extra layer of security to your account."
          right={<Pill tone="warn">Not enabled</Pill>}
        />
        <CardBody>
          <div className="grid grid-cols-1" style={{ gap: 14 }}>
            <MiniCard
              title="Authenticator app"
              sub="Use Google Authenticator, 1Password, or similar."
              action={<Btn variant="pulse">Set up</Btn>}
              disabled
            />
          </div>
        </CardBody>
      </Card>
      <ComingSoonNote>
        2FA enrollment and active session tracking ship in Phase B. Password change is fully live
        today.
      </ComingSoonNote>
    </>
  );
}

function MiniCard({ title, sub, action, disabled }) {
  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: "white",
        border: "1px solid var(--line)",
        padding: 16,
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <div className="font-semibold text-[13px]" style={{ color: "var(--ink)" }}>
        {title}
      </div>
      <div className="text-[12px] mt-1 mb-3" style={{ color: "var(--ink-3)" }}>
        {sub}
      </div>
      <div style={{ pointerEvents: disabled ? "none" : "auto" }}>{action}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 8. Danger zone — delete account wired, others stubbed
// ──────────────────────────────────────────────────────────────────────

function DangerSection({ client, onDelete }) {
  return (
    <>
      <SectionHeading title="Danger zone" sub="Irreversible actions. Please proceed carefully." />
      <Card danger>
        <CardHeader
          title="Destructive actions"
          sub="Each action requires confirmation and a typed password."
          icon="trash"
          danger
        />
        <div>
          <DangerRow
            title="Transfer ownership"
            sub="Move the Owner role to another admin. You will be downgraded to Admin."
            action={
              <Btn variant="danger-ghost" disabled>
                Transfer
              </Btn>
            }
          />
          <DangerRow
            title="Export all data"
            sub="Download a ZIP of every survey response, transcript, member roster, and audit log. Available for 24 hours."
            action={
              <Btn variant="danger-ghost" disabled>
                Request export
              </Btn>
            }
          />
          <DangerRow
            title="Pause all surveys"
            sub="Stop sending invitations and reminders across all communities. In-flight responses still complete."
            action={
              <Btn variant="danger-ghost" disabled>
                Pause portfolio
              </Btn>
            }
          />
          <DangerRow
            highlight
            title="Delete account"
            sub={
              <>
                Permanently delete <strong>{client?.company_name || "your account"}</strong> and all
                associated data — board members, survey rounds, responses, AI insights, and
                integrations. This cannot be undone.
              </>
            }
            action={
              <Btn variant="danger" onClick={onDelete}>
                Delete account
              </Btn>
            }
          />
        </div>
      </Card>
      <ComingSoonNote>
        Transfer ownership, data export, and pause-portfolio land in Phase B. Account deletion is
        fully live today.
      </ComingSoonNote>
    </>
  );
}

function DangerRow({ title, sub, action, highlight }) {
  return (
    <div
      className="flex items-start justify-between gap-6"
      style={{
        padding: "16px 24px",
        borderTop: "1px solid var(--line)",
        backgroundColor: highlight ? "var(--coral-tint, #fdecea)" : "white",
      }}
    >
      <div className="min-w-0">
        <div
          className="font-semibold text-[13.5px]"
          style={{ color: highlight ? "var(--coral)" : "var(--ink)" }}
        >
          {title}
        </div>
        <div className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)" }}>
          {sub}
        </div>
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Modals — preserved verbatim from prior version, restyled to tokens
// ──────────────────────────────────────────────────────────────────────

function ModalShell({ children, onClose, width = 420 }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(11,27,43,0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl bg-white mx-4"
        style={{
          width: "100%",
          maxWidth: width,
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ChangePasswordModal({ pwForm, setPwForm, pwSaving, pwMessage, onSubmit, onClose }) {
  return (
    <ModalShell onClose={onClose}>
      <div style={{ padding: 24 }}>
        <h2
          className="font-semibold mb-4"
          style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)" }}
        >
          Change password
        </h2>
        <form onSubmit={onSubmit} className="flex flex-col" style={{ gap: 12 }}>
          <FieldLabel label="Current password">
            <input
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
              className="rp-input"
              required
              autoFocus
            />
          </FieldLabel>
          <FieldLabel label="New password">
            <input
              type="password"
              value={pwForm.newPw}
              onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
              className="rp-input"
              required
              minLength={8}
            />
          </FieldLabel>
          <FieldLabel label="Confirm new password">
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              className="rp-input"
              required
            />
          </FieldLabel>
          {pwMessage && (
            <p
              className="text-[12.5px]"
              style={{
                color: pwMessage.type === "success" ? "var(--pulse-deep)" : "var(--coral)",
              }}
            >
              {pwMessage.text}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <Btn type="submit" variant="pulse" disabled={pwSaving} style={{ flex: 1 }}>
              {pwSaving ? "Changing…" : "Change password"}
            </Btn>
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}

function ChangePlanModal(props) {
  const {
    plans,
    client,
    planError,
    planLoading,
    setPlanLoading,
    setPlanError,
    setSubMessage,
    loadData,
    onClose,
  } = props;
  return (
    <ModalShell onClose={onClose} width={720}>
      <div style={{ padding: 24 }}>
        <h2
          className="font-semibold mb-4"
          style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)" }}
        >
          Change your plan
        </h2>
        {planError && (
          <div
            className="rounded-lg px-3 py-2 text-[12.5px] mb-3"
            style={{
              backgroundColor: "var(--coral-tint, #fdecea)",
              color: "var(--coral)",
              border: "1px solid var(--coral-soft, #f1c8bd)",
            }}
          >
            {planError}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 10 }}>
          {plans.map((plan) => {
            const isCurrent = client?.subscription?.plan_id === plan.id;
            const isFree = plan.name === "free";
            const memberCount = client?.usage?.member_count || 0;
            const wouldExceed = memberCount > plan.member_limit;
            return (
              <button
                key={plan.id}
                type="button"
                disabled={isCurrent || planLoading}
                onClick={async () => {
                  setPlanError("");
                  setPlanLoading(true);
                  try {
                    const res = await fetch("/api/admin/account/subscription/change-plan", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ plan_id: plan.id }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    if (data.checkout_url) {
                      window.location.href = data.checkout_url;
                    } else {
                      setSubMessage(data.message);
                      onClose();
                      loadData();
                    }
                  } catch (err) {
                    setPlanError(err.message);
                  } finally {
                    setPlanLoading(false);
                  }
                }}
                className="text-left transition rounded-xl"
                style={{
                  padding: 14,
                  border: isCurrent ? "2px solid var(--pulse)" : "1px solid var(--line)",
                  backgroundColor: isCurrent ? "var(--pulse-tint)" : "white",
                  cursor: isCurrent || planLoading ? "default" : "pointer",
                  opacity: planLoading ? 0.5 : 1,
                  position: "relative",
                }}
              >
                {isCurrent && (
                  <span
                    className="absolute font-semibold rounded"
                    style={{
                      top: 8,
                      right: 8,
                      fontSize: 9.5,
                      padding: "2px 6px",
                      backgroundColor: "var(--pulse)",
                      color: "white",
                      letterSpacing: "0.04em",
                    }}
                  >
                    CURRENT
                  </span>
                )}
                <div
                  className="font-semibold"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                    color: "var(--ink)",
                  }}
                >
                  {plan.display_name}
                </div>
                <div className="text-[11.5px] mt-1" style={{ color: "var(--ink-3)" }}>
                  Up to <strong style={{ color: "var(--ink-2)" }}>{plan.member_limit}</strong>{" "}
                  members · {plan.survey_rounds_per_year}/yr
                </div>
                <div className="mt-2">
                  {isFree ? (
                    <span
                      className="font-semibold text-[12px]"
                      style={{ color: "var(--pulse-deep)" }}
                    >
                      Free Forever
                    </span>
                  ) : (
                    <span style={{ color: "var(--ink)" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 18,
                          fontWeight: 500,
                        }}
                      >
                        ${(plan.price_cents / 100).toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--ink-3)",
                        }}
                      >
                        {" /mo"}
                      </span>
                    </span>
                  )}
                </div>
                {wouldExceed && !isCurrent && (
                  <p className="text-[11px] mt-2" style={{ color: "var(--amber, #B97A1F)" }}>
                    {memberCount} active · {memberCount - plan.member_limit} would deactivate.
                  </p>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end mt-4">
          <Btn variant="ghost" onClick={onClose}>
            Close
          </Btn>
        </div>
      </div>
    </ModalShell>
  );
}

function CancelSubModal(props) {
  const {
    cancelLoading,
    cancelError,
    setCancelError,
    setCancelLoading,
    setSubMessage,
    loadData,
    onClose,
  } = props;
  return (
    <ModalShell onClose={onClose}>
      <div style={{ padding: 24 }}>
        <h2
          className="font-semibold mb-2"
          style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--coral)" }}
        >
          Cancel subscription
        </h2>
        <p className="text-[13px] mb-2" style={{ color: "var(--ink-2)" }}>
          Your subscription stays active until the end of your billing period. After that, your
          account is downgraded to the <strong>Free plan</strong>:
        </p>
        <ul
          className="text-[12.5px] mb-4 pl-5"
          style={{ color: "var(--ink-3)", listStyle: "disc" }}
        >
          <li>25 board members max</li>
          <li>2 survey rounds per year</li>
          <li>Members over the limit will be deactivated</li>
        </ul>
        {cancelError && (
          <p className="text-[12.5px] mb-3" style={{ color: "var(--coral)" }}>
            {cancelError}
          </p>
        )}
        <div className="flex gap-2">
          <Btn
            variant="danger"
            disabled={cancelLoading}
            onClick={async () => {
              setCancelError("");
              setCancelLoading(true);
              try {
                const res = await fetch("/api/admin/account/subscription/cancel", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setSubMessage(data.message);
                onClose();
                loadData();
              } catch (err) {
                setCancelError(err.message);
              } finally {
                setCancelLoading(false);
              }
            }}
            style={{ flex: 1 }}
          >
            {cancelLoading ? "Cancelling…" : "Confirm cancellation"}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>
            Keep plan
          </Btn>
        </div>
      </div>
    </ModalShell>
  );
}

function DeleteAccountModal(props) {
  const {
    companyName,
    deletePassword,
    setDeletePassword,
    deleteError,
    deleting,
    onSubmit,
    onClose,
  } = props;
  return (
    <ModalShell onClose={onClose}>
      <div style={{ padding: 24 }}>
        <h2
          className="font-semibold mb-2"
          style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--coral)" }}
        >
          Delete account
        </h2>
        <p className="text-[13px] mb-4" style={{ color: "var(--ink-2)" }}>
          This will permanently delete <strong>{companyName}</strong> and all data. Enter your
          password to confirm.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col" style={{ gap: 10 }}>
          <input
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            className="rp-input"
            placeholder="Enter your password"
            required
            autoFocus
          />
          {deleteError && (
            <p className="text-[12.5px]" style={{ color: "var(--coral)" }}>
              {deleteError}
            </p>
          )}
          <div className="flex gap-2 mt-1">
            <Btn type="submit" variant="danger" disabled={deleting} style={{ flex: 1 }}>
              {deleting ? "Deleting…" : "Permanently delete"}
            </Btn>
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Inline icon set (matches other v2 screens — no new dependency)
// ──────────────────────────────────────────────────────────────────────

function Ico({ name, size = 14 }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  switch (name) {
    case "building":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path
            {...stroke}
            d="M4 21V6l8-3 8 3v15M9 21v-5h6v5M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"
          />
        </svg>
      );
    case "user":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path {...stroke} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle {...stroke} cx="12" cy="7" r="4" />
        </svg>
      );
    case "users":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path {...stroke} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle {...stroke} cx="9" cy="7" r="4" />
          <path {...stroke} d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "card":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <rect {...stroke} x="2" y="5" width="20" height="14" rx="2" />
          <path {...stroke} d="M2 10h20" />
        </svg>
      );
    case "star":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path
            {...stroke}
            d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          />
        </svg>
      );
    case "bell":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path
            {...stroke}
            d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
          />
        </svg>
      );
    case "shield":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path {...stroke} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "trash":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path
            {...stroke}
            d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"
          />
        </svg>
      );
    case "chart":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path {...stroke} d="M3 3v18h18M7 14l4-4 4 4 5-7" />
        </svg>
      );
    default:
      return null;
  }
}

function CheckIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="m20 6-11 11-5-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers + scoped styles
// ──────────────────────────────────────────────────────────────────────

function formatRelative(iso) {
  if (!iso) return "just now";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AccountStyles() {
  return (
    <style>{`
      .rp-input {
        width: 100%;
        padding: 9px 12px;
        font-size: 13px;
        color: var(--ink);
        background: white;
        border: 1px solid var(--line-2);
        border-radius: 8px;
        outline: none;
        font-family: var(--font-sans);
        transition: border-color 120ms, box-shadow 120ms;
      }
      .rp-input:focus {
        border-color: var(--pulse);
        box-shadow: 0 0 0 3px rgba(31,165,113,0.15);
      }
    `}</style>
  );
}
