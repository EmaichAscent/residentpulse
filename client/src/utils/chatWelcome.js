/**
 * Build the trust-contract welcome message shown above the resident chat
 * before they tap "Sounds good →" to engage.
 *
 * Voice rules (from V2 board-interview prompt + design handoff §5.8):
 *   - Warm, human, concrete. Names a real CM if we have one.
 *   - States the timing expectation honestly ("about 5 minutes").
 *   - Sets the privacy contract: management company sees a summary,
 *     never the actual exchange. (Per ResidentPulse founder, transcripts
 *     are hidden from clients; only summaries flow back.)
 *   - Ends with a "Sound good?" beat that gives the resident agency to
 *     opt in before any score is asked.
 *   - No "End Chat" prompt — V2 forbids that. Voice/mic hints live
 *     elsewhere (input area), not in the welcome.
 */
export function buildWelcomeMessage({ firstName, company, community, communityManagerName }) {
  const userName = firstName || "there";
  const companyName = company || "your management company";
  // Prefer the named CM; fall back to "your team at {company}" so the
  // copy still feels human when no manager is assigned to the community.
  const introducer = communityManagerName
    ? `${communityManagerName.split(" ")[0]} at ${companyName}`
    : `your team at ${companyName}`;

  // We don't include community in the welcome itself anymore — it's in
  // the header. Argument retained for forward compatibility / tests.
  void community;

  return `Hi ${userName} — ${introducer} asked me to check in. About 5 minutes, totally honest answers. Your management company sees only a summary, not this conversation. Sound good?`;
}
