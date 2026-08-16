---
name: OpenAPI integer compatibility
description: Generated Zod validators may target APIs unavailable in the workspace's installed Zod version.
---

When adding OpenAPI numeric fields, confirm the generated validator is compatible with the installed Zod major version; `type: integer` can generate `z.int()`, which is unavailable in Zod 3.

**Why:** Codegen completed successfully but the chained library typecheck failed because the generated validator used a newer Zod API than the workspace dependency.

**How to apply:** After every OpenAPI change, run codegen and the library typecheck before relying on the generated client; either use a compatible schema shape or intentionally upgrade the Zod dependency.