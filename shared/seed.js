import { IdGenerator } from "./id.js";
import { TimeProvider } from "./time.js";

export function defaultSeed() {
  const now = TimeProvider.nowIso();
  const withMeta = (p) => ({
    id: IdGenerator.newId(),
    created_at: now,
    updated_at: now,
    last_used: null,
    used_times: 0,
    ...p,
  });

  return [
    withMeta({
      title: "Professional Email",
      content:
        "Dear [Name],\n\nI hope this email finds you well. I wanted to reach out regarding [topic].\n\nBest regards,\n[Your name]",
      tags: ["email", "professional", "template"],
    }),
    withMeta({
      title: "Code Review Comment",
      content:
        "Great work! A few suggestions:\n1. Consider extracting this logic into a separate function for reusability\n2. Add error handling for edge cases\n3. Could we add unit tests for this functionality?",
      tags: ["code", "review", "feedback"],
    }),
    withMeta({
      title: "Meeting Notes Template",
      content:
        "## Meeting: [Title]\n**Date:** [Date]\n**Attendees:** [Names]\n\n### Agenda\n- \n\n### Discussion Points\n- \n\n### Action Items\n- [ ] \n\n### Next Steps\n- ",
      tags: ["meeting", "notes", "template"],
    }),
  ];
}
