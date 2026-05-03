/**
 * Test Interview personas — scripted transcripts that exercise the
 * board-interview prompt's rules. Used by SuperAdminTestInterview
 * (PR 5 of the SuperAdmin overhaul) per the handoff §6 spec.
 *
 * Each persona's transcript is fully scripted (no live LLM call) per
 * the handoff §"What NOT to ship in v1":
 *
 *   "Real-time test-interview streaming against the live model. v1
 *    can be deferred to a 'run test' job that completes in 10–20
 *    seconds and renders the transcript on completion."
 *
 * The value is in the rule-fired annotations — they tell the operator
 * which sentence in the AI's response was driven by which prompt
 * rule. If a prompt edit breaks a rule, the annotation drops out and
 * the operator sees it.
 *
 * Transcript shape:
 *   transcript: [
 *     { role: "user",      text: "..." , flag?: "abstract"|"legal" },
 *     { role: "assistant", text: "...", critique?: { rule, why } },
 *     ...
 *   ]
 *
 * The summary card at the end of the run renders as a leaf-tinted
 * card in the right rail — it's NOT part of the transcript itself.
 */

export const TEST_PERSONAS = [
  {
    id: "vague-promoter",
    name: "Linda Martinez",
    role: "Board Treasurer · Magnolia Pointe",
    score: 9,
    description:
      "Promoter who opens with 'no real complaints'. Tests the forbidden-easy-answers rule: a 9 with vague positive framing should be pushed for a concrete proof point.",
    summary:
      "AI converted a vague promoter into a concrete data point — Sarah (CM) returned a gate-code call within 2 hours on April 12. That's the kind of evidence the prompt is designed to extract from 9-10 scores.",
    transcript: [
      {
        role: "user",
        text: "My NPS score is 9 out of 10.",
      },
      {
        role: "assistant",
        text: "A 9 — solid. What's the most recent thing they did that you'd point to?",
        critique: {
          rule: "NPS opener (9–10 variant)",
          why: "Score-specific opener fired correctly. No 'thanks for sharing' preamble, no echo, straight to the most-recent-proof-point question.",
        },
      },
      {
        role: "user",
        text: "Yeah, things are good. No real complaints.",
        flag: "abstract",
      },
      {
        role: "assistant",
        text: "If a friend on another board asked privately what could be better, what would you say?",
        critique: {
          rule: "Forbidden easy answers — 'no complaints'",
          why: "AI didn't accept 'no real complaints' as a complete answer. Instead, used the friend-asking-privately reframe (one of the canonical anti-cliché probes).",
        },
      },
      {
        role: "user",
        text: "I mean — Sarah's been great. Returned my gate-code call within two hours last week.",
      },
      {
        role: "assistant",
        text: "Got it — that's the kind of thing we can build a pattern from. Anything else on your mind I should pass along — even small stuff?",
        critique: {
          rule: "Thread completion + 'anything else' close",
          why: "Concrete proof point captured (incident + who + when implied). Thread complete → pivot to the standard wrap question rather than drilling further on a positive answer.",
        },
      },
      {
        role: "user",
        text: "No, that's it.",
      },
      {
        role: "assistant",
        text: "Thank you for your time, I'm concluding this chat.",
        critique: {
          rule: "Closing the chat (V2.4+)",
          why: "Standard close fired with the exact required sentence. Frontend strips the trailing [CHAT:END] tag and auto-ends 3s later.",
        },
      },
    ],
  },
  {
    id: "frustrated-passive",
    name: "Marcus Bell",
    role: "Board President · Aspen Heights",
    score: 7,
    description:
      "Passive who hedges with abstract nouns ('communication') and connects multiple incidents. Tests the anti-abstraction rule + pattern recognition across two related events.",
    summary:
      "AI surfaced a structural pattern: vendor switch + special-assessment surprise both trace to decision-communication. The interview produced a finding with two corroborating incidents — exactly what the AI is designed to do for passives.",
    transcript: [
      {
        role: "user",
        text: "My NPS score is 7 out of 10.",
      },
      {
        role: "assistant",
        text: "A 7. What would have to be different for you to give a 10?",
        critique: {
          rule: "NPS opener (7–8 variant)",
          why: "Score-specific opener fired. No score-shaming, no validation talk — straight to the 'gap to a 10' question.",
        },
      },
      {
        role: "user",
        text: "They're okay. Could be better with communication, I guess.",
        flag: "abstract",
      },
      {
        role: "assistant",
        text: "Walk me through one specific example from the last month.",
        critique: {
          rule: "Anti-abstraction rule — 'communication'",
          why: "Abstract noun detected ('communication'). AI did NOT accept it; pivoted to the canonical 'walk me through' probe for one concrete incident.",
        },
      },
      {
        role: "user",
        text: "Well, they switched landscaping vendors and we found out from the new vendor showing up. No heads-up email.",
      },
      {
        role: "assistant",
        text: "Who at the company should have made that call?",
        critique: {
          rule: "Thread completion — collecting the WHO",
          why: "Got incident + when (last month). Now collecting WHO so the thread is checklist-complete (incident ✓, who pending, when ✓, missed=advance notice ✓).",
        },
      },
      {
        role: "user",
        text: "Probably our regional. We've had this happen before — same thing with the special assessment in Q1.",
      },
      {
        role: "assistant",
        text: "Got it. Switching gears — how are board notices and meeting prep coming through these days?",
        critique: {
          rule: "Thread completion — pivot after 4-of-4",
          why: "Now have TWO incidents (vendor switch + Q1 assessment) sharing the same root cause: decision-communication failure. Pattern locked in. Pivots to a different coverage area instead of drilling further.",
        },
      },
      {
        role: "user",
        text: "Notices are fine, actually. On time and accurate.",
      },
      {
        role: "assistant",
        text: "Anything else on your mind I should pass along — even small stuff?",
        critique: {
          rule: "Accept-fine + close gate",
          why: "'Fine' on notices accepted; one-line acknowledgment + pivot to standard wrap question (not another drill).",
        },
      },
      {
        role: "user",
        text: "No, I think that covers it.",
      },
      {
        role: "assistant",
        text: "Thank you for your time, I'm concluding this chat.",
        critique: {
          rule: "Closing the chat (V2.4+)",
          why: "Standard wrap fired with the required exact sentence + (hidden) [CHAT:END] tag.",
        },
      },
    ],
  },
  {
    id: "angry-detractor",
    name: "Dana Wilson",
    role: "Board Member · The Reserve",
    score: 3,
    description:
      "Detractor with multiple unresolved issues. Tests the stay-on-thread + detractor depth-budget + ROOT TOPIC discipline (V2.5) — multiple sub-causes are ONE thread, not new threads.",
    summary:
      "AI got two specific incidents (gate broken since April 5, fallen tree from November storm) and the underlying root cause (follow-up gap) in 5 questions. V2.5's ROOT TOPIC discipline kept it from rabbit-holing into managers/budgeting/handoff like V2.4 did on staging.",
    transcript: [
      {
        role: "user",
        text: "My NPS score is 3 out of 10.",
      },
      {
        role: "assistant",
        text: "A 3 — that tells me something specific. What's the most recent moment that pushed it there?",
        critique: {
          rule: "NPS opener (0–6 variant)",
          why: "Score-specific opener for detractors. 'That tells me something specific' acknowledges without thanking; primes for an incident.",
        },
      },
      {
        role: "user",
        text: "Honestly, I'm frustrated. Things just aren't getting handled.",
        flag: "abstract",
      },
      {
        role: "assistant",
        text: "Walk me through one specific example from the last month.",
        critique: {
          rule: "Anti-abstraction rule — 'getting handled'",
          why: "Abstract framing ('not getting handled') triggers the canonical probe. No 'I hear you', no 'that sounds frustrating' validation talk (V2.5 forbids those).",
        },
      },
      {
        role: "user",
        text: "Our pool gate has been broken since April 5. Multiple work orders. Nothing.",
      },
      {
        role: "assistant",
        text: "Who's the manager that owns that work order?",
        critique: {
          rule: "Thread completion — collecting the WHO",
          why: "Got incident (broken gate) + when (April 5) + missed (no fix). Now WHO so the thread is 4-of-4. NOT drilling into the broader 'things aren't handled' framing — same root, would be the same thread under V2.5.",
        },
      },
      {
        role: "user",
        text: "Joe Maxwell, our CM. But honestly the same thing happened with a tree that came down in the November storm.",
      },
      {
        role: "assistant",
        text: "Got it. Switching gears — how are board notices and meeting prep coming through these days?",
        critique: {
          rule: "ROOT TOPIC discipline (V2.5)",
          why: "TWO incidents now share the same root: follow-up gap. That's ONE thread under V2.5 (sub-causes / examples count as the same root topic). Pivots immediately rather than drilling for a third example. The V2.5 fix in action.",
        },
      },
      {
        role: "user",
        text: "Notices are fine.",
      },
      {
        role: "assistant",
        text: "Anything else on your mind I should pass along — even small stuff?",
        critique: {
          rule: "Accept-fine + close gate",
          why: "Quick acknowledgment + pivot to wrap. Detractor got proper depth (5 questions, one thread fully evidenced) without being interrogated.",
        },
      },
      {
        role: "user",
        text: "No, that's all.",
      },
      {
        role: "assistant",
        text: "Thank you for your time, I'm concluding this chat.",
        critique: {
          rule: "Closing the chat (V2.4+)",
          why: "Standard close. Detractor session captured 1 root topic with 2 corroborating incidents in 5 turns — within the 5-7 question budget.",
        },
      },
    ],
  },
  {
    id: "legal-risk",
    name: "Robert Chen",
    role: "Board President · Lakeside Estates",
    score: 2,
    description:
      "Detractor who opens with an attorney mention. Tests the sensitive-topics rule for legal/litigation language — AI must stay neutral, capture specifics, flag for human review.",
    summary:
      "AI navigated a legal-risk session correctly: stayed neutral on the attorney framing, captured a specific Q4 discrepancy (~$14K), and emitted a flag annotation for human review. Did NOT promise outcomes or speculate on the legal position.",
    transcript: [
      {
        role: "user",
        text: "My NPS score is 2 out of 10.",
      },
      {
        role: "assistant",
        text: "A 2 — that tells me something specific. What's the most recent moment that pushed it there?",
        critique: {
          rule: "NPS opener (0–6 variant)",
          why: "Score-specific opener for detractors fired correctly. Same opener as the Angry Detractor persona — the rule doesn't see legal context yet.",
        },
      },
      {
        role: "user",
        text: "I'm only doing this because my attorney said it might be useful documentation.",
        flag: "legal",
      },
      {
        role: "assistant",
        text: "Understood. What specific issue prompted you to consult an attorney?",
        critique: {
          rule: "Sensitive topics — Legal/litigation",
          why: "Legal mention detected. AI stays NEUTRAL (no 'oh wow', no 'I'm sure they didn't mean to'), no validation of the legal position, asks for the underlying specifics. Session metadata flagged for human review.",
        },
      },
      {
        role: "user",
        text: "There's about $14,000 missing from our Q4 financials and no explanation.",
      },
      {
        role: "assistant",
        text: "Who at the company has the Q4 reconciliation?",
        critique: {
          rule: "Thread completion — capture specifics neutrally",
          why: "Captures the dollar figure ($14K) and the period (Q4) verbatim. Asks for WHO without editorializing on whether something improper happened. The metadata flag stays on; the AI keeps gathering.",
        },
      },
      {
        role: "user",
        text: "Our property accountant. Marina Cox. She hasn't responded to three emails.",
      },
      {
        role: "assistant",
        text: "Got it. Is there anything else specific you'd like documented today?",
        critique: {
          rule: "Sensitive topics — capture verbatim, no commitments",
          why: "Thread complete (incident + WHO + WHEN + missed=response). Pivots to a final 'anything else' WITHOUT promising outcomes ('I'll make sure they look into this' is forbidden). Note: did NOT pivot to a different coverage area — for legal-risk sessions the right move is to give the resident space to add more.",
        },
      },
      {
        role: "user",
        text: "No, just wanted that on the record.",
      },
      {
        role: "assistant",
        text: "Thank you for your time, I'm concluding this chat.",
        critique: {
          rule: "Closing the chat — neutral exit",
          why: "Standard close. No 'I'm sorry to hear that', no 'I hope this gets resolved' — staying neutral all the way through the wrap. Session lands with the legal-flag in metadata for the human admin to triage.",
        },
      },
    ],
  },
];

/**
 * Look up a persona by id. Returns null if not found.
 */
export function getPersonaById(id) {
  return TEST_PERSONAS.find((p) => p.id === id) || null;
}
