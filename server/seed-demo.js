/**
 * Seed demo data for "Zee Best Management" (client_id=1)
 * Creates 3 concluded survey rounds with realistic NPS data
 *
 * Round 1 (Aug 2025): NPS -29 — industry typical
 * Round 2 (Jan 2026): NPS -13 — improvement after feedback
 * Round 3 (Feb 2026): NPS +13 — cresting zero
 *
 * Usage: node seed-demo.js
 */

import pg from "pg";
const { Client } = pg;

const DB_URL = "postgresql://postgres:oFEhZharorzXMamZidgnQvLSDVVrYojv@shuttle.proxy.rlwy.net:24483/railway";
const CLIENT_ID = 1;

const client = new Client(DB_URL);

async function run(sql, params = []) {
  let idx = 1;
  const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
  const result = await client.query(pgSql, params);
  return result;
}

async function insert(sql, params = []) {
  let idx = 1;
  const pgSql = sql.replace(/\?/g, () => `$${idx++}`) + " RETURNING id";
  const result = await client.query(pgSql, params);
  return result.rows[0]?.id;
}

// Members mapped by email (we'll look up IDs from DB)
const MEMBERS = {};

// ============================================================
// ROUND DATA
// ============================================================

const ROUNDS = [
  {
    round_number: 1,
    launched_at: "2025-08-15T14:00:00Z",
    closes_at: "2025-09-14T14:00:00Z",
    concluded_at: "2025-09-14T14:00:00Z",
    scheduled_date: "2025-08-15",
    // NPS = (1 promoter - 3 detractors) / 7 = -29
    sessions: [
      { email: "asujeff48@gmail.com", nps: 9, community: "Largo Court",
        summary: "Jeff is the standout positive voice this round. Praises community manager Brenda for clear financial reporting and responsive communication. Feels Largo Court is well-managed compared to their previous company. Only minor wish is for more community social events.",
        messages: [
          { role: "user", content: "9" },
          { role: "assistant", content: "That's a strong score, Jeff! What's driving your satisfaction with Zee Best Management?" },
          { role: "user", content: "Brenda is the main reason. She's our community manager at Largo Court and she's fantastic. She responds to emails the same day, the financial reports are clear and detailed, and she comes to board meetings prepared with everything we need." },
          { role: "assistant", content: "Sounds like Brenda is a real asset. Is there anything that would push you to a perfect 10?" },
          { role: "user", content: "Maybe more community events. We don't really have any social gatherings organized by the management company. It would be nice to have a holiday party or neighborhood cleanup day — something to bring people together." },
          { role: "assistant", content: "Community building is a great suggestion. Thank you for the thoughtful feedback, Jeff!" },
        ]},
      { email: "kevinmathewhardy@gmail.com", nps: 8, community: "Largo Court",
        summary: "Kevin is generally satisfied with Largo Court management but not enthusiastic. Appreciates Brenda's work but feels the company as a whole could be more proactive about communicating upcoming projects and assessments to homeowners.",
        messages: [
          { role: "user", content: "8" },
          { role: "assistant", content: "Thanks for that solid rating, Kevin. What's your overall impression?" },
          { role: "user", content: "Largo Court is in decent shape. Brenda does good work for us. My issue is more with the broader company — we had a special assessment last quarter and homeowners didn't hear about it until very late. That caused a lot of frustration at the board level because we got blamed for the poor communication." },
          { role: "assistant", content: "That's a valid concern — board members shouldn't be put in that position. Is the day-to-day management solid otherwise?" },
          { role: "user", content: "Yeah, the basics are fine. Financials are good, meetings are organized. It's more the big-picture communication that needs work. When something affects homeowners' wallets, they need to hear about it early." },
          { role: "assistant", content: "Early communication on financial impacts — that's a clear and actionable improvement area. Thank you, Kevin." },
        ]},
      { email: "amanda.sanchez@camascent.com", nps: 7, community: "Hilltop Highlands",
        summary: "Amanda finds the management adequate but unremarkable. Emergency response has been good when needed, but routine operations feel like an afterthought. Wants to see more structured processes for maintenance tracking.",
        messages: [
          { role: "user", content: "7" },
          { role: "assistant", content: "A 7 — decent but room for improvement. What's working and what isn't at Hilltop Highlands?" },
          { role: "user", content: "When there's an emergency, they respond well. We had a burst pipe in the clubhouse and they had someone out within hours. But the day-to-day stuff feels disorganized. I submitted a request about broken sprinklers three weeks ago and I still don't know if anyone's working on it." },
          { role: "assistant", content: "That gap between emergency response and routine maintenance is interesting. Do you have visibility into where your requests stand?" },
          { role: "user", content: "No, and that's the problem. There's no system for tracking open items. I email, they say they'll handle it, and then I have to follow up repeatedly. It would be so much easier if there was a portal or tracking system where I could see the status." },
          { role: "assistant", content: "A maintenance tracking system could really close that gap. Thank you for that specific and constructive feedback, Amanda." },
        ]},
      { email: "mollyhardy04@gmail.com", nps: 7, community: "Grapevine Estates",
        summary: "Molly rates the management as acceptable. Appreciates that they're friendly and easy to reach by phone, but frustrated that action doesn't always follow. Maintenance requests at Grapevine seem to get deprioritized.",
        messages: [
          { role: "user", content: "7" },
          { role: "assistant", content: "Thanks, Molly. What's your experience been like at Grapevine Estates?" },
          { role: "user", content: "Our community manager Sarah is nice and always picks up the phone, which I appreciate. But saying you'll take care of something and actually doing it are two different things. We've been waiting on a fence repair in the common area for over a month." },
          { role: "assistant", content: "That follow-through gap can be really frustrating. Does it feel like a resource issue or a priority issue?" },
          { role: "user", content: "I think they're stretched too thin. Sarah seems to be managing too many communities at once. She means well but I don't think she has the bandwidth to stay on top of everything." },
          { role: "assistant", content: "Workload and capacity — that's an important structural observation. Thank you, Molly." },
        ]},
      { email: "andreamike834@gmail.com", nps: 5, community: "Grapevine Estates",
        summary: "Andrea is disappointed with the management. Communication is inconsistent, board meeting minutes are often late, and she feels the company treats Grapevine as a lower priority compared to their other communities.",
        messages: [
          { role: "user", content: "5" },
          { role: "assistant", content: "A 5 tells me there are real concerns, Andrea. What's happening at Grapevine Estates?" },
          { role: "user", content: "I feel like we're not a priority. Board meeting minutes take weeks to get sent out, if they come at all. Last month we didn't receive them until I called and asked. And when we do get reports, they look like they were thrown together last minute — formatting errors, wrong dates, that kind of thing." },
          { role: "assistant", content: "That lack of attention to detail can really undermine confidence. Are there specific operational concerns too?" },
          { role: "user", content: "Yes — we asked for three bids on a roofing project and only got one. When I pushed back, they said it was hard to find vendors. But that's their job. We're paying them to manage this for us, and it feels like we're doing half the work ourselves." },
          { role: "assistant", content: "Having to chase your management company for basic deliverables is not a good sign. That's important feedback, Andrea. Thank you." },
        ]},
      { email: "mike@fetchrocket.com", nps: 4, community: "Hilltop Highlands",
        summary: "Mike is quite frustrated. Highlights that communication between board meetings is almost nonexistent. A major plumbing issue went unreported for two weeks. Vendor management is poor — contractors don't show up and nobody follows up.",
        messages: [
          { role: "user", content: "4" },
          { role: "assistant", content: "Mike, a 4 indicates significant dissatisfaction. What's been going on at Hilltop Highlands?" },
          { role: "user", content: "Communication is the biggest issue. Between board meetings, we hear nothing. Last month there was a plumbing issue in the community building and the board didn't find out for two weeks — from a resident complaint, not from management. That's completely unacceptable." },
          { role: "assistant", content: "Finding out about building issues from residents rather than your management company is a real problem. What else is concerning you?" },
          { role: "user", content: "Vendor management is terrible. We had a landscaping crew that was supposed to start Monday — they never showed. When I asked what happened, our manager said he'd 'look into it.' Three days later, still nothing. I ended up calling the vendor myself to find out they'd been moved to another property. Nobody told us." },
          { role: "assistant", content: "No proactive updates and having to chase vendors yourself — that defeats the purpose of having a management company. Thank you for being specific, Mike." },
        ]},
      { email: "brandon@bush.dev", nps: 6, community: "Hilltop Highlands",
        summary: "Brandon is on the fence. Thinks the management company has potential but is concerned about lack of financial transparency. The recent budget increase wasn't well-explained and vendor selection feels opaque.",
        messages: [
          { role: "user", content: "6" },
          { role: "assistant", content: "Brandon, a 6 puts you right at the line. What would tip you in either direction?" },
          { role: "user", content: "Transparency, mostly. Our HOA fees went up 6% this year and the explanation was basically 'rising costs.' That's not good enough. I want to see line-item comparisons, where the increases are coming from, and what we're getting for the extra money." },
          { role: "assistant", content: "Detailed budget justification is reasonable. Are there other transparency concerns?" },
          { role: "user", content: "The vendor selection process. I have no idea how they choose contractors. Are they getting competitive bids? Is there a relationship we should know about? I'm not accusing anyone of anything, but the lack of visibility makes me uncomfortable." },
          { role: "assistant", content: "Financial transparency and vendor selection visibility — both are governance fundamentals. Thank you for raising these, Brandon." },
        ]},
    ],
    insights: {
      nps_score: -29,
      response_count: 7,
      generated_at: "2025-09-15T10:00:00Z",
      executive_summary: "Zee Best Management's first NPS survey reveals a score of -29, consistent with industry averages for HOA management (~-35). The results highlight systemic issues around communication gaps, inconsistent follow-through on maintenance, and lack of financial transparency. One community — Largo Court — stands out positively thanks to community manager Brenda, while Grapevine Estates and Hilltop Highlands report significant frustration with responsiveness and vendor management.",
      key_findings: [
        { finding: "Largo Court is a bright spot driven by strong community manager relationship", evidence: "The lone promoter specifically credits community manager Brenda for same-day email responses, clear financial reports, and well-prepared board meetings. Largo Court board members are notably more positive than other communities.", severity: "positive" },
        { finding: "Communication between board meetings is nearly nonexistent", evidence: "Multiple board members across communities report having no updates between meetings. One board learned about a major plumbing issue from a resident complaint two weeks after it occurred, not from their management company.", severity: "critical" },
        { finding: "Maintenance follow-through and tracking are inconsistent", evidence: "Requests go weeks without resolution. Board members report having to follow up repeatedly with no visibility into status. Vendors fail to show up with no notification. A sprinkler repair and fence repair have been open for 3+ weeks.", severity: "critical" },
        { finding: "Financial transparency and vendor selection lack rigor", evidence: "HOA fee increase justified only as 'rising costs' without line-item detail. Roofing project received only one bid despite request for three. Board members uncomfortable with opaque vendor selection process.", severity: "concerning" },
      ],
      recommended_actions: [
        { priority: "high", action: "Implement monthly board update emails between meetings covering open maintenance items, upcoming projects, financial highlights, and vendor activity", impact: "Closes the critical communication gap that is the number one driver of dissatisfaction", rationale: "Board members across all communities cite lack of proactive communication as their primary frustration" },
        { priority: "high", action: "Establish a maintenance request tracking process with defined SLAs and status visibility for board members", impact: "Addresses the second biggest pain point and reduces the need for repeated follow-ups", rationale: "Multiple respondents describe submitting requests and hearing nothing back, having to chase for updates" },
        { priority: "medium", action: "Provide detailed budget breakdowns with year-over-year comparisons and formalize a competitive bidding policy for vendor selection", impact: "Builds financial trust and governance confidence with board members", rationale: "Fee increases without explanation and single-bid vendor selection are eroding trust" },
      ],
      cam_ascent_callouts: [
        { area: "Operational Communication Framework", opportunity: "Board members receive almost no updates between meetings, creating information vacuums and reactive management", suggested_service: "Design structured communication cadence with monthly board digests, incident notification protocols, and defined escalation paths" },
        { area: "Financial Governance & Vendor Transparency", opportunity: "Budget increases lack justification and vendor selection appears opaque to board members", suggested_service: "Implement transparent budget presentation framework with line-item detail and establish competitive bidding policies with board visibility into vendor selection criteria" },
      ],
    },
    wordFreqs: [
      { word: "communication", count: 8 }, { word: "maintenance", count: 7 }, { word: "board", count: 6 },
      { word: "vendor", count: 6 }, { word: "follow-up", count: 5 }, { word: "financial", count: 5 },
      { word: "transparency", count: 4 }, { word: "response", count: 4 }, { word: "budget", count: 4 },
      { word: "requests", count: 3 }, { word: "meetings", count: 3 }, { word: "tracking", count: 3 },
      { word: "reports", count: 3 }, { word: "manager", count: 3 }, { word: "residents", count: 2 },
      { word: "bidding", count: 2 }, { word: "stretched", count: 2 }, { word: "proactive", count: 2 },
    ],
    alerts: [],
  },
  {
    round_number: 2,
    launched_at: "2026-01-10T14:00:00Z",
    closes_at: "2026-02-09T14:00:00Z",
    concluded_at: "2026-02-09T14:00:00Z",
    scheduled_date: "2026-01-10",
    // NPS = (2 promoters - 3 detractors) / 8 = -13
    sessions: [
      { email: "asujeff48@gmail.com", nps: 10, community: "Largo Court",
        summary: "Jeff's satisfaction increased to a perfect 10. Brenda continues to excel and the company has started monthly board update emails, which was his suggestion from the last round. Feels heard and valued.",
        messages: [
          { role: "user", content: "10" },
          { role: "assistant", content: "Jeff, you've gone up to a perfect 10! What changed?" },
          { role: "user", content: "They actually listened to the feedback. We now get a monthly email update between board meetings with status on open items, upcoming projects, and financial highlights. That was exactly what people were asking for last round." },
          { role: "assistant", content: "That's great to hear — feedback driving real change. Anything else you've noticed?" },
          { role: "user", content: "Brenda organized a neighborhood cleanup day last month. Great turnout, and it really helped build community spirit. She mentioned the survey feedback inspired it. That kind of initiative is why I love working with her." },
          { role: "assistant", content: "Survey feedback inspiring community events — that's the loop working perfectly. Thank you, Jeff!" },
        ]},
      { email: "amanda.sanchez@camascent.com", nps: 9, community: "Hilltop Highlands",
        summary: "Amanda is significantly more positive. Impressed by the response to an emergency water main break — management had contractors on site within 90 minutes and kept the board informed throughout. Also notices improvement in routine communication.",
        messages: [
          { role: "user", content: "9" },
          { role: "assistant", content: "Amanda, that's a big jump from 7 last round! What improved?" },
          { role: "user", content: "Two things. First, we had a water main break in December and the response was incredible — contractor on site in 90 minutes, and our manager sent the board an update every two hours until it was resolved. That's the kind of management I've been wanting to see." },
          { role: "assistant", content: "Excellent emergency response with proactive communication. And the second thing?" },
          { role: "user", content: "The monthly update emails are a real improvement. I can see what's in the pipeline and what's been resolved. It's not a full tracking system yet, but it's a huge step forward from hearing nothing between meetings." },
          { role: "assistant", content: "Emergency response plus regular communication — those two together make a big difference. Thank you, Amanda." },
        ]},
      { email: "kevinmathewhardy@gmail.com", nps: 8, community: "Largo Court",
        summary: "Kevin's score remains steady. Appreciates the new monthly update emails and feels communication has improved. Still wants to see better advance notice on homeowner-impacting decisions.",
        messages: [
          { role: "user", content: "8" },
          { role: "assistant", content: "Kevin, holding steady at 8. Has anything changed since last round?" },
          { role: "user", content: "The monthly update emails are a nice addition. I can see the company is making an effort to communicate more, and I appreciate that. Brenda continues to be solid for Largo Court specifically." },
          { role: "assistant", content: "Glad the communication is improving. Is there still a gap you'd like to see closed?" },
          { role: "user", content: "I still think homeowners need earlier notice on things that affect their finances — assessments, fee changes, major project costs. The emails are great for board members but regular homeowners still feel in the dark." },
          { role: "assistant", content: "Extending better communication to homeowners, not just boards — that's the next level. Good point, Kevin." },
        ]},
      { email: "mollyhardy04@gmail.com", nps: 8, community: "Grapevine Estates",
        summary: "Molly's score improved slightly. Sarah left and was replaced by a new manager who is still learning, but Molly appreciates the effort being made. The fence repair from last round was finally completed.",
        messages: [
          { role: "user", content: "8" },
          { role: "assistant", content: "Molly, up from 7 to 8. What's your take on things at Grapevine?" },
          { role: "user", content: "Sarah left the company, which was concerning. But the new person, Jake, seems to be trying hard. He called me personally to introduce himself and asked what our priorities were. That's a good start." },
          { role: "assistant", content: "Personal outreach during a transition shows initiative. How has the day-to-day been?" },
          { role: "user", content: "The fence repair I mentioned last time finally got done, which is good. Jake also told me they're working on a better system for tracking maintenance requests. I'll believe it when I see it, but the intent is there." },
          { role: "assistant", content: "Cautious optimism is fair. The personal touch during the transition and getting that fence done are good signs. Thank you, Molly." },
        ]},
      { email: "kaitlinh06@vt.edu", nps: 7, community: "Largo Court",
        summary: "Kaitlin's first survey response. She's relatively new to the board at Largo Court. Finds the management professional enough but wishes there were more resources for new board members to get up to speed.",
        messages: [
          { role: "user", content: "7" },
          { role: "assistant", content: "Thanks for participating, Kaitlin! As a newer board member, how has your experience been?" },
          { role: "user", content: "Pretty good overall. The monthly emails are helpful for staying informed. Brenda has been patient answering my questions, which I appreciate since I'm still learning the ropes of being on an HOA board." },
          { role: "assistant", content: "Having a supportive community manager makes a big difference when you're new. Is there anything that would help?" },
          { role: "user", content: "A welcome packet or orientation guide for new board members would be amazing. I had to figure out everything — governing documents, vendor contacts, budget cycles — on my own. Some kind of onboarding process would save a lot of time." },
          { role: "assistant", content: "New board member onboarding — practical and impactful suggestion. Thank you, Kaitlin!" },
        ]},
      { email: "andreamike834@gmail.com", nps: 6, community: "Grapevine Estates",
        summary: "Andrea improved slightly from 5 to 6. Acknowledges some communication improvements but still frustrated that core issues persist. The new community manager doesn't know the governing documents well enough and board meeting quality has declined since Sarah left.",
        messages: [
          { role: "user", content: "6" },
          { role: "assistant", content: "Andrea, slight improvement from last round. What's changed and what hasn't?" },
          { role: "user", content: "I'll give credit — the monthly update emails are a step forward. But Grapevine specifically is struggling since Sarah left. Jake means well but he doesn't know our governing documents, and the last board meeting was a mess because he couldn't answer basic questions about our CC&Rs." },
          { role: "assistant", content: "That's a real issue — a community manager needs to know the governing docs. Is the board considering escalating?" },
          { role: "user", content: "We've talked about it. Our contract renewal is in six months and right now I'd say the board is split. If things don't improve significantly, we'll seriously look at other companies. I don't want to switch — switching is painful — but we need competent management." },
          { role: "assistant", content: "A six-month window for improvement with contract renewal at stake — that's a clear signal. Thank you for your honesty, Andrea." },
        ]},
      { email: "mike@fetchrocket.com", nps: 6, community: "Hilltop Highlands",
        summary: "Mike improved from 4 to 6, a meaningful jump. Acknowledges the monthly update emails helped and one long-standing maintenance issue was resolved. But still sees inconsistency — some things get done quickly while others languish.",
        messages: [
          { role: "user", content: "6" },
          { role: "assistant", content: "Mike, up from 4 to 6 — notable improvement. What got better?" },
          { role: "user", content: "The plumbing issue I complained about last time? Fixed within a week of the survey results going out. And the monthly emails are helpful — I can at least see what they say they're working on. So progress, yes." },
          { role: "assistant", content: "Good to hear there was follow-through. What's keeping you from going higher?" },
          { role: "user", content: "Consistency. The plumbing got fixed fast, probably because I flagged it in the survey. But the landscaping vendor still no-shows sometimes and we've had parking lot lights out for three weeks now. It feels like only the squeaky wheel gets the grease." },
          { role: "assistant", content: "Consistency across all issues, not just the escalated ones — that's the next bar to clear. Thank you, Mike." },
        ]},
      { email: "brandon@bush.dev", nps: 5, community: "Hilltop Highlands",
        summary: "Brandon dropped from 6 to 5. While he appreciates the communication improvements, his core concern about financial transparency hasn't been addressed. The latest financial report still lacked the detail he requested and a vendor invoice discrepancy went unexplained.",
        messages: [
          { role: "user", content: "5" },
          { role: "assistant", content: "Brandon, you went down a point. What happened?" },
          { role: "user", content: "My core ask was better financial transparency. The monthly emails are fine but the actual financial reports are still the same generic format. No line-item comparisons, no variance explanations. I asked specifically for this last round and nothing changed." },
          { role: "assistant", content: "That's frustrating when you've given specific, actionable feedback and it wasn't addressed. Anything else?" },
          { role: "user", content: "I found a vendor invoice that was 40% higher than the original quote and asked for an explanation. Took two weeks to hear back and the answer was basically 'scope changed.' No documentation, no approval trail. This is exactly the transparency issue I've been raising." },
          { role: "assistant", content: "Unapproved scope changes with no documentation — that's a governance concern. I understand why the score went down. Thank you, Brandon." },
        ]},
    ],
    insights: {
      nps_score: -12,
      response_count: 8,
      generated_at: "2026-02-10T10:00:00Z",
      executive_summary: "NPS improved from -29 to -12, a meaningful 17-point gain driven primarily by the introduction of monthly board update emails and improved responsiveness on flagged maintenance items. Two communities are trending positively — Largo Court remains strong and Hilltop Highlands shows improvement. Grapevine Estates is at risk due to the community manager transition. Financial transparency remains unaddressed and is actively eroding one board member's confidence. Contract renewal discussions at Grapevine add urgency to continued improvement.",
      key_findings: [
        { finding: "Monthly update emails are the most impactful improvement", evidence: "Every respondent mentioned the new monthly board update emails positively. They directly address the Round 1 feedback about communication gaps between meetings. Board members report feeling more informed and connected.", severity: "positive" },
        { finding: "Community manager transition at Grapevine Estates creating risk", evidence: "Sarah's departure and replacement with Jake has created a competency gap. New manager doesn't know governing documents well enough, resulting in poor board meeting quality. Board is split on contract renewal in 6 months.", severity: "critical" },
        { finding: "Maintenance responsiveness improved for escalated items but remains inconsistent", evidence: "Previously flagged items (plumbing issue, fence repair) were resolved quickly. But new issues (parking lot lights, landscaping no-shows) still languish. Perception is that only 'squeaky wheel' items get attention.", severity: "concerning" },
        { finding: "Financial transparency request from Round 1 went unaddressed", evidence: "Board member specifically asked for line-item budget detail and competitive bidding visibility. Reports are unchanged. A 40% vendor invoice variance went unexplained for two weeks. Score dropped from 6 to 5.", severity: "concerning" },
      ],
      recommended_actions: [
        { priority: "high", action: "Fast-track community manager onboarding at Grapevine Estates — Jake must study governing documents and demonstrate competency before the next board meeting", impact: "Prevents loss of a community with contract renewal in 6 months", rationale: "Board member explicitly stated they're considering switching companies. Jake's lack of governing document knowledge is the primary driver." },
        { priority: "high", action: "Address financial transparency requests with detailed budget reports including year-over-year comparisons and vendor invoice approval documentation", impact: "Re-engages a disengaging board member and addresses governance concerns", rationale: "Specific, actionable feedback given in Round 1 was not implemented. Score dropped from 6 to 5 despite other improvements." },
        { priority: "medium", action: "Extend maintenance tracking improvements across all open items, not just escalated ones, to build consistent responsiveness", impact: "Moves detractors into passive territory by demonstrating reliable follow-through", rationale: "Responsiveness is improving but only for items specifically flagged. Board members want to see systemic reliability, not just reactive fixes." },
      ],
      cam_ascent_callouts: [
        { area: "Community Manager Onboarding & Training", opportunity: "Manager transition exposed lack of onboarding protocols — new manager not prepared on governing documents or community-specific knowledge", suggested_service: "Develop comprehensive manager transition playbook with governing document certification, board introduction protocols, and 30-60-90 day competency milestones" },
        { area: "Financial Governance & Reporting", opportunity: "Board members requesting detailed financial transparency that current reporting doesn't provide. Vendor invoice variances lack documentation.", suggested_service: "Implement enhanced financial reporting with line-item detail, variance analysis, and vendor invoice approval workflows" },
      ],
    },
    wordFreqs: [
      { word: "communication", count: 7 }, { word: "monthly", count: 6 }, { word: "emails", count: 6 },
      { word: "maintenance", count: 6 }, { word: "financial", count: 5 }, { word: "transparency", count: 5 },
      { word: "board", count: 5 }, { word: "vendor", count: 4 }, { word: "documents", count: 4 },
      { word: "governing", count: 4 }, { word: "improvement", count: 3 }, { word: "manager", count: 3 },
      { word: "transition", count: 3 }, { word: "contract", count: 3 }, { word: "renewal", count: 2 },
      { word: "tracking", count: 2 }, { word: "onboarding", count: 2 }, { word: "responsive", count: 2 },
    ],
    alerts: [
      { email: "andreamike834@gmail.com", alert_type: "contract_termination", severity: "critical",
        description: "Board member at Grapevine Estates reports board is split on contract renewal in 6 months. New community manager's lack of governing document knowledge cited as primary concern. Board will 'seriously look at other companies' if improvement doesn't accelerate.",
        dismissed: false, solved: true, solve_note: "Company owner personally contacted Grapevine board. Committed to fast-tracking Jake's training and assigned senior manager Lisa as interim support. Board agreed to reassess at 90-day mark." },
    ],
  },
  {
    round_number: 3,
    launched_at: "2026-02-10T14:00:00Z",
    closes_at: "2026-03-12T14:00:00Z",
    concluded_at: "2026-02-22T14:00:00Z",
    scheduled_date: "2026-02-10",
    // NPS = (2 promoters - 1 detractor) / 8 = +13
    sessions: [
      { email: "asujeff48@gmail.com", nps: 10, community: "Largo Court",
        summary: "Jeff remains a perfect 10 and strong advocate. Notes that Brenda has been promoted to a mentoring role, helping other community managers improve. Sees the whole company leveling up.",
        messages: [
          { role: "user", content: "10" },
          { role: "assistant", content: "Three rounds in and still a perfect 10, Jeff. What's keeping you so positive?" },
          { role: "user", content: "Brenda got promoted — she's now mentoring other community managers while still serving Largo Court. That tells me the company is investing in quality, not just cutting costs. She's helping raise the bar across all their communities." },
          { role: "assistant", content: "Promoting top talent to elevate the whole organization — that's a strong signal. Anything new on your wish list?" },
          { role: "user", content: "Honestly, everything I've asked for has been addressed. Monthly emails, community events, now mentoring for other managers. I'm genuinely impressed with the trajectory." },
          { role: "assistant", content: "A satisfied customer who sees continuous improvement — that's the goal. Thank you, Jeff!" },
        ]},
      { email: "amanda.sanchez@camascent.com", nps: 9, community: "Hilltop Highlands",
        summary: "Amanda remains a strong promoter. Thrilled that a work order tracking system was implemented — exactly what she asked for in Round 1. Feels the management company is genuinely responsive to feedback.",
        messages: [
          { role: "user", content: "9" },
          { role: "assistant", content: "Amanda, holding strong at 9. What's your current take?" },
          { role: "user", content: "They implemented a work order tracking system! I can submit a request and see exactly where it is in the process — assigned, in progress, completed. No more guessing or chasing. This is exactly what I asked for back in the first survey." },
          { role: "assistant", content: "That's a direct feedback-to-action loop. Is it working well in practice?" },
          { role: "user", content: "It's not perfect — some items still take longer than I'd like — but at least I can see they're being worked on. And the emergency response continues to be excellent. Overall, the improvement trajectory gives me confidence." },
          { role: "assistant", content: "Visibility even when things take time — that builds trust. Thank you, Amanda." },
        ]},
      { email: "andreamike834@gmail.com", nps: 8, community: "Grapevine Estates",
        summary: "Andrea's score jumped significantly from 6 to 8. After the owner's intervention, senior manager Lisa was assigned to support Grapevine. Jake improved dramatically with mentoring. Board voted to renew the contract.",
        messages: [
          { role: "user", content: "8" },
          { role: "assistant", content: "Andrea, from a 5 to now an 8 — that's a real turnaround. What changed at Grapevine?" },
          { role: "user", content: "After the last survey, the company owner called me personally. He apologized for the transition issues, took responsibility, and assigned a senior manager — Lisa — to support Jake. The difference has been night and day. Jake is now prepared for meetings, knows our documents, and Lisa checks in with the board monthly." },
          { role: "assistant", content: "That's exactly the kind of executive accountability that rebuilds trust. Did the board decide on contract renewal?" },
          { role: "user", content: "We voted to renew. The board agreed that the improvement was genuine, not just a temporary fix. Jake's growth has been impressive and Lisa's oversight gives us confidence. I wouldn't say we're out of the woods yet, but we're definitely heading the right direction." },
          { role: "assistant", content: "Contract renewed and genuine improvement — that's a great outcome. The 'not out of the woods yet' caution is healthy. Thank you, Andrea." },
        ]},
      { email: "kevinmathewhardy@gmail.com", nps: 7, community: "Largo Court",
        summary: "Kevin dipped slightly from 8 to 7. Still satisfied with Largo Court management but had an issue with a special assessment communication that reached homeowners late. Feels the homeowner-facing communication still lags behind the board-level improvements.",
        messages: [
          { role: "user", content: "7" },
          { role: "assistant", content: "Kevin, down a point from last time. What happened?" },
          { role: "user", content: "We had another special assessment situation and homeowners found out late again. The board communication is much better now — I get the monthly emails and feel informed. But homeowners are still getting blindsided by financial news, and they come to us board members frustrated." },
          { role: "assistant", content: "So the board-level communication improved but homeowner-facing communication is still the gap?" },
          { role: "user", content: "Exactly. Brenda is great with us but we need a system for keeping all homeowners informed, not just the board. A quarterly newsletter to residents or something. The board can't be the go-between for everything." },
          { role: "assistant", content: "Homeowner communication as the next frontier — makes sense. Thank you, Kevin." },
        ]},
      { email: "mike@fetchrocket.com", nps: 7, community: "Hilltop Highlands",
        summary: "Mike improved from 6 to 7. The work order tracking system has been a game changer and the parking lot lights that were out last round were fixed. Still wants to see more consistency before he fully trusts the improvements.",
        messages: [
          { role: "user", content: "7" },
          { role: "assistant", content: "Mike, another point up. What's improving at Hilltop?" },
          { role: "user", content: "The work order tracking system is great — I can see what's open, what's assigned, and what's done. The parking lot lights I complained about last round got fixed, and the landscaping vendor issue was resolved. Real progress." },
          { role: "assistant", content: "That's good to hear. What would it take to go higher?" },
          { role: "user", content: "Time and consistency. I need to see this level of responsiveness for six months, not just right after a survey. If the improvements stick, I'll be happy to go to a 9 or 10. But I've been burned before by temporary fixes." },
          { role: "assistant", content: "Trust through sustained consistency — that's fair and reasonable. Thank you, Mike." },
        ]},
      { email: "mollyhardy04@gmail.com", nps: 7, community: "Grapevine Estates",
        summary: "Molly dropped slightly from 8 to 7. Appreciates the overall improvement at Grapevine but had a frustrating experience with a pool maintenance issue that was handled poorly. Willing to give them more time.",
        messages: [
          { role: "user", content: "7" },
          { role: "assistant", content: "Molly, down a point from last time. What's going on?" },
          { role: "user", content: "Overall things are better at Grapevine. Jake has improved a lot with Lisa's help. But we had a pool maintenance issue last month — the heater broke and it took two weeks to get fixed because they ordered the wrong part twice. That level of operational fumbling is frustrating." },
          { role: "assistant", content: "Vendor coordination issues can undermine broader improvements. Is this a pattern or a one-off?" },
          { role: "user", content: "I think it's a one-off, but it happened at a bad time — right when I was starting to feel really good about the direction. I'm willing to give them more time. The trajectory is positive overall." },
          { role: "assistant", content: "Fair to note a stumble while acknowledging the overall positive trend. Thank you for that balanced perspective, Molly." },
        ]},
      { email: "kaitlinh06@vt.edu", nps: 8, community: "Largo Court",
        summary: "Kaitlin improved from 7 to 8. The company created a new board member welcome guide, which directly addressed her suggestion from last round. Feels more supported and confident in her role.",
        messages: [
          { role: "user", content: "8" },
          { role: "assistant", content: "Kaitlin, up from 7 to 8! What improved?" },
          { role: "user", content: "They actually created a board member welcome guide! It covers governing documents, vendor contacts, budget cycles, meeting protocols — everything I had to figure out on my own. I gave one to a friend who just joined a different HOA board and she was jealous." },
          { role: "assistant", content: "Your suggestion from last round becoming reality — that's the feedback loop in action. What would take you higher?" },
          { role: "user", content: "I'd love to see more community events. The cleanup day was great but it was a one-off. Regular quarterly events would help build the community feel that I think is missing from our neighborhood." },
          { role: "assistant", content: "From one-off to regular cadence — great next step. Thank you, Kaitlin!" },
        ]},
      { email: "eehardy10@gmail.com", nps: 5, community: "Hilltop Highlands",
        summary: "Erin's first response and she's a detractor. While acknowledging recent improvements, she's still angry about the parking lot lights being out for over two months earlier — a safety issue. Her neighbor tripped and fell in the dark parking lot during that time.",
        messages: [
          { role: "user", content: "5" },
          { role: "assistant", content: "Erin, welcome to the survey. A 5 indicates some concerns — what's on your mind?" },
          { role: "user", content: "I know things have supposedly gotten better recently, but I walk my dog at night and those parking lot lights were out for over two months before anyone fixed them. Two months. My neighbor tripped and fell in the dark parking lot. That's a safety issue, not a 'we'll get to it' item." },
          { role: "assistant", content: "A safety issue with an injury — that absolutely should have been prioritized. Has the situation improved?" },
          { role: "user", content: "The lights are fixed now, yes. And I see the new work order system which is fine. But it shouldn't take a survey and multiple complaints to get parking lot lights fixed. I need to see them be proactive about safety before I'll rate them higher." },
          { role: "assistant", content: "Safety-critical items need immediate prioritization, not escalation through surveys. That's completely valid feedback. Thank you, Erin." },
        ]},
    ],
    insights: {
      nps_score: 13,
      response_count: 8,
      generated_at: "2026-02-23T10:00:00Z",
      executive_summary: "NPS has crossed into positive territory for the first time, rising from -12 to +13 — a 42-point improvement over two rounds. The improvement is driven by concrete actions: work order tracking, monthly communications, executive intervention at Grapevine Estates resulting in contract renewal, and a new board member welcome guide. However, the score reflects cautious optimism rather than enthusiasm — most respondents are passives who want to see sustained improvement before fully committing. One new detractor raises a valid safety-related maintenance concern that needs a systemic response.",
      key_findings: [
        { finding: "Work order tracking system is delivering measurable satisfaction gains", evidence: "Board members at Hilltop Highlands specifically cite the new tracking system as a game changer. Visibility into request status eliminates the need for follow-up chasing. One respondent noted it was 'exactly what I asked for back in the first survey.'", severity: "positive" },
        { finding: "Executive intervention at Grapevine Estates prevented client loss", evidence: "Owner's personal outreach, assignment of senior manager Lisa, and Jake's accelerated development resulted in contract renewal vote. Board member went from 5 to 8, noting the improvement is 'genuine, not just a temporary fix.'", severity: "positive" },
        { finding: "Majority of respondents are cautious passives waiting to see sustained improvement", evidence: "Five of eight respondents scored 7-8 (passive range). Multiple explicitly stated they need to see 'consistency over time' and 'six months of this' before raising their scores higher. The improvement is acknowledged but trust hasn't fully recovered.", severity: "concerning" },
        { finding: "Safety-critical maintenance items lack priority classification", evidence: "New respondent reports parking lot lights were out for 2+ months, resulting in a neighbor fall/injury. Safety items were treated the same as routine maintenance with no expedited response protocol.", severity: "critical" },
        { finding: "Homeowner-facing communication still lags behind board-level improvements", evidence: "Board members report that while their own communication with management improved significantly, regular homeowners are still being surprised by assessments and financial news. Board members are stuck as intermediaries.", severity: "concerning" },
      ],
      recommended_actions: [
        { priority: "high", action: "Create safety-priority classification for maintenance requests involving lighting, trip hazards, water damage, and structural issues with a mandatory 48-hour response SLA", impact: "Prevents safety incidents and potential liability. Addresses the only detractor's primary concern.", rationale: "Two-month delay on parking lot lights resulted in a resident injury. Safety items need systemic prioritization, not ad-hoc escalation." },
        { priority: "medium", action: "Launch quarterly homeowner newsletter covering community updates, upcoming projects, financial summaries, and event announcements", impact: "Extends the communication improvements from board level to all homeowners, reducing board member burden as intermediaries", rationale: "Board members report homeowners are still uninformed about assessments and financial changes despite improved board-level communication." },
        { priority: "medium", action: "Expand community events from one-off cleanup days to quarterly programming across all communities", impact: "Builds community engagement and differentiates from competitors. Addresses multiple requests.", rationale: "The initial cleanup day was well-received. Multiple respondents requesting regular events as community-building tool." },
        { priority: "low", action: "Maintain current improvement trajectory — the biggest risk is regression. Continue monthly updates, work order tracking, and Lisa's oversight at Grapevine", impact: "Converts cautious passives into promoters over the next 1-2 rounds", rationale: "Most respondents explicitly stated they need to see sustained consistency before raising scores. Regression would be more damaging than lack of new features." },
      ],
      cam_ascent_callouts: [
        { area: "Safety & Risk Management Protocols", opportunity: "Safety-related maintenance items lack priority classification, leading to unacceptable response times and a resident injury", suggested_service: "Implement tiered maintenance classification with safety-critical SLAs, automated escalation rules, and incident tracking to prevent liability exposure" },
        { area: "Resident Communication & Engagement", opportunity: "Board-level communication has improved but homeowner-facing communication remains weak. Community events are ad-hoc rather than programmatic.", suggested_service: "Design comprehensive resident engagement framework including quarterly newsletters, community event calendar, and digital communication channels" },
      ],
    },
    wordFreqs: [
      { word: "improved", count: 8 }, { word: "tracking", count: 7 }, { word: "communication", count: 6 },
      { word: "safety", count: 5 }, { word: "consistency", count: 5 }, { word: "community", count: 5 },
      { word: "maintenance", count: 4 }, { word: "board", count: 4 }, { word: "events", count: 4 },
      { word: "trust", count: 3 }, { word: "homeowners", count: 3 }, { word: "renewal", count: 3 },
      { word: "feedback", count: 3 }, { word: "manager", count: 3 }, { word: "proactive", count: 2 },
      { word: "welcome", count: 2 }, { word: "newsletter", count: 2 }, { word: "sustained", count: 2 },
    ],
    alerts: [
      { email: "eehardy10@gmail.com", alert_type: "safety_concern", severity: "high",
        description: "Board member reports parking lot lights were out for over 2 months. A resident neighbor tripped and fell in the dark parking lot during that period. Potential liability issue. Safety items not prioritized over routine maintenance.",
        dismissed: true, dismiss_reason: "Lights have been repaired. Implementing safety-priority maintenance classification with 48-hour response SLA for all safety-critical items." },
    ],
  },
];

async function seed() {
  await client.connect();
  console.log("Connected to production DB");

  try {
    await client.query("BEGIN");

    // Look up member IDs
    const users = await client.query("SELECT id, email FROM users WHERE client_id = $1", [CLIENT_ID]);
    for (const u of users.rows) MEMBERS[u.email] = u.id;
    console.log(`Found ${users.rows.length} members`);

    // Look up community IDs
    const comms = await client.query("SELECT id, community_name FROM communities WHERE client_id = $1", [CLIENT_ID]);
    const COMMUNITIES = {};
    for (const c2 of comms.rows) COMMUNITIES[c2.community_name] = c2.id;
    console.log(`Found ${comms.rows.length} communities`);

    // Wipe existing data for this client (same order as reset endpoint)
    console.log("Wiping existing survey data...");
    await run("DELETE FROM admin_interview_messages WHERE interview_id IN (SELECT id FROM admin_interviews WHERE client_id = ?)", [CLIENT_ID]);
    await run("DELETE FROM admin_interviews WHERE client_id = ?", [CLIENT_ID]);
    await run("DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE client_id = ?)", [CLIENT_ID]);
    await run("DELETE FROM critical_alerts WHERE client_id = ?", [CLIENT_ID]);
    await run("DELETE FROM invitation_logs WHERE client_id = ?", [CLIENT_ID]);
    await run("DELETE FROM sessions WHERE client_id = ?", [CLIENT_ID]);
    await run("DELETE FROM email_jobs WHERE client_id = ?", [CLIENT_ID]);
    await run("DELETE FROM round_community_snapshots WHERE round_id IN (SELECT id FROM survey_rounds WHERE client_id = ?)", [CLIENT_ID]);
    await run("DELETE FROM survey_rounds WHERE client_id = ?", [CLIENT_ID]);

    // Create rounds
    for (const round of ROUNDS) {
      console.log(`\nCreating Round ${round.round_number}...`);

      const roundId = await insert(
        `INSERT INTO survey_rounds (client_id, round_number, status, scheduled_date, launched_at, closes_at, concluded_at, members_invited, insights_json, insights_generated_at, word_frequencies)
         VALUES (?, ?, 'concluded', ?, ?, ?, ?, ?, ?::jsonb, ?, ?::jsonb)`,
        [CLIENT_ID, round.round_number, round.scheduled_date, round.launched_at, round.closes_at, round.concluded_at,
         users.rows.length, JSON.stringify(round.insights), round.insights.generated_at, JSON.stringify(round.wordFreqs)]
      );
      console.log(`  Round ID: ${roundId}`);

      // Create sessions and messages
      for (const sess of round.sessions) {
        const userId = MEMBERS[sess.email];
        const communityId = COMMUNITIES[sess.community] || null;

        const sessionId = await insert(
          `INSERT INTO sessions (email, nps_score, completed, summary, community_name, management_company, user_id, client_id, round_id, community_id, created_at)
           VALUES (?, ?, TRUE, ?, ?, 'Zee Best Management', ?, ?, ?, ?, ?)`,
          [sess.email, sess.nps, sess.summary, sess.community, userId, CLIENT_ID, roundId, communityId, round.launched_at]
        );

        for (const msg of sess.messages) {
          await insert(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            [sessionId, msg.role, msg.content, round.launched_at]
          );
        }

        // Create invitation log
        await insert(
          "INSERT INTO invitation_logs (user_id, client_id, email_status, round_id, sent_at) VALUES (?, ?, 'sent', ?, ?)",
          [userId, CLIENT_ID, roundId, round.launched_at]
        );

        console.log(`  Session: ${sess.email} (NPS ${sess.nps})`);
      }

      // Create alerts
      for (const alert of round.alerts) {
        const userId = MEMBERS[alert.email];
        const alertId = await insert(
          `INSERT INTO critical_alerts (client_id, round_id, user_id, alert_type, severity, description, dismissed, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [CLIENT_ID, roundId, userId, alert.alert_type, alert.severity, alert.description, alert.dismissed, round.launched_at]
        );

        if (alert.solved) {
          await run("UPDATE critical_alerts SET solved = TRUE, solve_note = ? WHERE id = ?", [alert.solve_note, alertId]);
        }
        if (alert.dismiss_reason) {
          await run("UPDATE critical_alerts SET dismissed_at = CURRENT_TIMESTAMP, dismiss_reason = ? WHERE id = ?", [alert.dismiss_reason, alertId]);
        }

        console.log(`  Alert: ${alert.alert_type} (${alert.email})`);
      }

      // Create round-community snapshots
      for (const [name, commId] of Object.entries(COMMUNITIES)) {
        await insert(
          `INSERT INTO round_community_snapshots (round_id, community_id, community_name, status, created_at)
           VALUES (?, ?, ?, 'active', ?)`,
          [roundId, commId, name, round.concluded_at]
        );
      }
    }

    // Create 2 planned future rounds
    console.log("\nCreating planned rounds...");
    await insert(
      "INSERT INTO survey_rounds (client_id, round_number, status, scheduled_date) VALUES (?, 4, 'planned', '2026-08-15')",
      [CLIENT_ID]
    );
    await insert(
      "INSERT INTO survey_rounds (client_id, round_number, status, scheduled_date) VALUES (?, 5, 'planned', '2027-02-15')",
      [CLIENT_ID]
    );

    await client.query("COMMIT");
    console.log("\nDone! Seeded 3 concluded rounds + 2 planned rounds.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error — rolled back:", err.message);
    throw err;
  } finally {
    await client.end();
  }
}

seed();
