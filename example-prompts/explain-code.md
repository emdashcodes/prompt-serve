---
name: Explain Code Snippet
description: Explains a given code snippet, optionally considering the language.
schema:
  type: object
  properties:
    code:
      description: The code snippet to explain.
      required: true
      type: string
    language:
      description: The programming language of the snippet (optional).
      type: string
---

Explain the following ${language || 'code'} snippet. Focus on:

1. **Functionality:** What does the code do?
2. **Key Parts:** Describe the main components or logic.
3. **Potential Issues:** Are there any obvious bugs, edge cases, or areas for improvement?
4. **Clarity:** How clear is the code? Suggest improvements if needed.

```${language || ''}
${code}
```
