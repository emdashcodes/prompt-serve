---
name: Github PR
description: Generates a PR, git commit message, and provides a code review.
schema:
  type: object
  properties:
    changes:
      description: The code changes to review
      required: true
    issueNumber:
      description: The issue number this PR addresses
    context:
      description: Additional context about the changes
---

## Changes

${changes}

## Context

${context}

Provide the following:

1. A concise PR title (under 70 characters) that clearly describes the changes
2. A recommended branch name that follows git branch naming conventions
3. A recommended commit message (under 70 characters)
4. A PR description following this template:

```
<!-- Link to the issue that this PR addresses, if applicable -->
Fixes #${issueNumber}

## Description
<!-- Provide a brief summary of the changes in this pull request -->

## Testing Instructions
<!-- Describe the tests you ran to verify your changes -->
```

The title should appear above the markdown block and be formatted as "**Title:** [Your concise title here]"

Focus on:

1. Creating a concise, descriptive title (under 70 characters) that captures the essence of the change
2. What issue this PR addresses (to fill in the "Fixes #" section)
3. Details needed for a clear description of the changes
4. Information about how the changes were or should be tested

Both the title and PR description should be concise but informative, highlighting the key changes and their purpose. The title should be specific enough that someone scanning a list of PRs would understand what this change accomplishes.

After providing all of the PR information, you must must also review the code.

## Code Review and Explanation

Please provide:

1. A comprehensive code explanation covering:
   - What the code does (overall functionality)
   - Key functions and their purpose
   - Potential bugs or optimizations
   - Architecture patterns used

2. After the explanation, provide a GitHub-style PR review in markdown code blocks that includes:
   - Overall assessment of the code
   - Specific line-by-line comments (using the >... quoted format for code references)
   - Suggestions for improvements
   - Any questions about implementation decisions

Format the PR review section as if you were commenting directly on a GitHub pull request, separate from the explanation section. Use markdown syntax that would be valid in a GitHub comment.

## Git Branch Naming Suggestion

- add/descriptive-name - For new features or enhancements
- fix/issue-description - For bug fixes
- update/descriptive-name - For general updates
- docs/update-area - For documentation only changes
- refactor/component-name - For code refactoring

Based on the context I provide, suggest a branch name that:

1. Uses the appropriate prefix (add, fix, update, docs, refactor)
2. Has a clear but concise descriptive name using kebab-case (lowercase with hyphens)
3. Is descriptive enough to understand the purpose from the name alone
4. Is not too long (ideally under 50 characters total)

Provide a brief explanation for why you chose that branch name based on the context.
