# Structured Pre-Chat Questions — Plan

**Status:** Brainstormed — waiting on stakeholder answers

## Concept

Add 3-5 optional structured questions that board members answer before the AI conversation begins. These capture specific data points (e.g., satisfaction with financial transparency, management responsiveness) in a structured format, while the AI interview continues to handle the open-ended, qualitative feedback.

## Why Pre-Chat (Not During Chat)

Having the AI ask structured questions mid-conversation is unreliable — it's hard to guarantee the AI asks every question, and parsing structured answers from free-form text is fragile. A simple form before the chat starts gives us clean data every time, and the AI can reference those answers to have a more informed conversation.

## Current Thinking

- **Question types:** Rating scale (1-5), multiple choice, short text — no matrix questions
- **Limit:** 3-5 questions max per round to keep it quick
- **Control:** SuperAdmin configures questions per client (clients may not know what to ask)
- **Optional:** Off by default, enabled per client
- **Analytics:** Per-question scores and trends across rounds in the dashboard

## Open Questions (Awaiting Stakeholder Input)

1. **Who creates the questions?** SuperAdmin-only, client admins too, or hybrid with a curated bank they choose from?
2. **Are questions the same every round, or can they change?** If swapped between rounds, do we track which questions were active in which round for historical comparison?
3. **What question types are needed?** We're proposing 1-5 rating scale, multiple choice, and short text. Sufficient, or need yes/no, ranking, Likert with custom labels?
4. **How important is cross-client standardization?** Same core questions for all clients (enables portfolio-wide benchmarking) or fully custom per client?
5. **What does reporting look like?** Simple averages and trends per question? Cross-community comparison? Correlation with NPS scores?
6. **Should the AI reference pre-chat answers?** e.g., if someone rates financial transparency 2/5, should the AI probe deeper? Adds value but adds complexity.
7. **Is there a specific client or use case driving this?** What questions would they actually ask today if they could?
