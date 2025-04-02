---
name: Meeting Summary
description: Summarizes meeting notes into key points and action items.
schema:
  type: object
  properties:
    notes:
      description: The raw notes taken during the meeting.
      required: true
      type: string
---

Please summarize the following meeting notes. Identify:

1. **Key Discussion Points:** What were the main topics discussed?
2. **Decisions Made:** What conclusions or decisions were reached?
3. **Action Items:** List any specific tasks assigned, including who is responsible (if mentioned).

Raw Notes:

```
${notes}
```

@_common-formatting.md
