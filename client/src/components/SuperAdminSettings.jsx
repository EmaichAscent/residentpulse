import PromptEditor from "./PromptEditor";

export default function SuperAdminSettings() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Base System Prompt</h2>
        <p className="text-sm text-gray-500">
          This is the global system prompt used when interviewing board members.
          Client-specific supplements from onboarding interviews are appended automatically.
        </p>
      </div>
      <PromptEditor isSuperAdmin={true} />
    </div>
  );
}
