import { IdGenerator } from "./id.js";
import { TimeProvider } from "./time.js";

export function defaultSeed() {
  const now = TimeProvider.nowIso();
  const withMeta = (p) => ({
    id: IdGenerator.newId(),
    created_at: now,
    updated_at: now,
    last_used_at: null,
    used_times: 0,
    ...p,
  });

  return [
    withMeta({
      title: "Polite Follow-Up Email",
      content:
        "Subject: Following up on [topic/project]\n\nHello [Recipient's Name],\n\nI hope this message finds you well. I just wanted to follow up regarding [specific item/topic] that I reached out about on [date]. I completely understand you may be busy, but I would appreciate it if you could let me know when you have a chance.\n\nPlease let me know if you need any additional information from my side to move things forward.\n\nThank you for your time and attention.\n\nBest regards,\n[Your Name]",
      tags: ["email", "follow-up", "professional"]
    }),
    withMeta({
      title: "Code Review Request",
      content: "You are an expert software engineer. Please review the following code for correctness, readability, maintainability, and performance. Provide:\n\n1. **Summary** of what the code does\n2. **Strengths** — what is done well\n3. **Issues** — possible bugs, edge cases, or anti-patterns\n4. **Improvements** — suggestions for clearer structure, naming, efficiency, or standards\n\nHere is the code:\n\n```{{CODE}}```",
      tags: ["code", "review", "engineering"],
    }),
    withMeta({
      title: "Meeting Notes Template",
      content:
        "## Meeting: [Title]\n**Date:** [Date]\n**Attendees:** [Names]\n\n### Agenda\n- \n\n### Discussion Points\n- \n\n### Action Items\n- [ ] \n\n### Next Steps\n- ",
      tags: ["meeting", "notes", "template"],
    }),
  ];
}
