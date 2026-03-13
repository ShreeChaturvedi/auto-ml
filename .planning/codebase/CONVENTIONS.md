# Coding Conventions

**Analysis Date:** 2026-03-13

## Naming Patterns

**Files:**
- `camelCase.ts` for services, utilities, helpers, and stores
  - Example: `authService.ts`, `typeCoercion.ts`, `projectStore.ts`
- `PascalCase.tsx` for React components
  - Example: `UploadArea.tsx`, `ProjectHeader.tsx`, `Button.tsx`
- `kebab-case` for route directories and feature groupings
  - Example: `upload/`, `data-viewer/`, `llm/`, `preprocessing/`
- `UPPERCASE.ts` for constants files or configuration (not widely used, but available as pattern)

**Functions:**
- `camelCase` for all functions and methods (async or sync)
  - Example: `hashPassword()`, `generateAccessToken()`, `isValidUploadStage()`
- Prefix utility functions descriptively: `get*`, `set*`, `create*`, `update*`, `delete*`, `is*`, `has*`
  - Examples: `getModelTemplate()`, `createProject()`, `isPhaseUnlocked()`

**Variables:**
- `camelCase` for all variables, parameters, and object properties
  - Example: `activeProjectId`, `uploadStage`, `projectState`
- Prefix with `mock` for test doubles: `mockUser`, `mockHasDatabaseConfiguration`
- Prefix with `use` for React hooks (automatically applied by React patterns)

**Types:**
- `PascalCase` for interfaces, types, and classes
  - Examples: `TokenPayload`, `AuthRequest`, `AuthTokens`, `UploadFlowMetadata`
- Prefix interfaces with `I` only when disambiguating implementation from interface (not prevalent in codebase)
- `enum` values in UPPERCASE or PascalCase depending on context
  - Used in discriminated unions: `type UploadFlowStage = 'upload' | 'processing' | 'chat'`

**Constants:**
- `UPPERCASE_SNAKE_CASE` for runtime constants and enums
  - Examples: `STAGE_ORDER = ['upload', 'processing', 'chat']`, `PHASE_VALUES`
- Constants defined at module level, often in dedicated arrays or objects

## Code Style

**Formatting:**
- **No formal Prettier config** — relies on ESLint for consistency
- Imports automatically alphabetized and grouped by ESLint import plugin
- Line length: no hard limit enforced, but code tends toward readability (120-160 char average)
- Indentation: 2 spaces (standard for TypeScript/Node.js in this project)
- Semicolons: required (enforced by ESLint)

**Linting:**
- **Tool:** ESLint with `typescript-eslint`
- **Backend ESLint:** (`/backend/eslint.config.js`)
  - Extends: `@eslint/js` recommended, `typescript-eslint` recommended, `eslint-plugin-import`
  - Key rule: `import/order` with alphabetical grouping and newlines between groups
  - Allows `console.log` statements (for debugging, disabled rule)
- **Frontend ESLint:** (`/frontend/eslint.config.js`)
  - Extends: Same as backend plus `react-hooks` and `react-refresh`
  - Enforces React hooks best practices and fast refresh compatibility

## Import Organization

**Order:**
1. Built-in Node.js modules (`import * from 'node:...'`)
2. Third-party packages (`import * from 'express'`, `import { z } from 'zod'`)
3. Type imports (`import type { ... }`)
4. Relative imports from same project (`import ... from '../'`, `import ... from './'`)

**Path Aliases:**
- **Backend:** No path aliases (uses relative imports exclusively)
- **Frontend:** `@/*` points to `src/`
  - Examples: `@/stores`, `@/components`, `@/lib/api`, `@/types`
  - Configured in `tsconfig.app.json`

**Example Import Block:**
```typescript
import express, { Router } from 'express';
import { z } from 'zod';

import type { ProjectRepository } from '../repositories/projectRepository.js';
import { registerHealthRoutes } from './health.js';
```

## Error Handling

**Patterns:**
- **Route handlers:** Return JSON error responses with status codes
  - 400 for validation errors: `res.status(400).json({ errors: result.error.flatten() })`
  - 404 for not found: `res.status(404).json({ error: 'Project not found' })`
  - 204 for successful deletion with no content
- **Zod validation:** Use `safeParse()` and check `.success` before using result
  - Example: `const result = projectInputSchema.safeParse(req.body); if (!result.success) { ... }`
- **Async route handlers:** Wrapped with `asyncHandler()` middleware to catch promise rejections
  - Location: `src/middleware/asyncHandler.ts`
  - Usage: `router.get('/path', asyncHandler(async (req, res) => { ... }))`
- **Try-catch blocks:** Used sparingly; mostly in token verification (`verifyAccessToken` returns `null` instead of throwing)
  - Location: `src/services/authService.ts` line 73-78
- **Frontend:** Use `try-catch` for API calls; display error toast via `sonner` library
  - Store errors in Zustand state for display in UI

**Example Error Handling:**
```typescript
// Route with validation
const result = projectInputSchema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ errors: result.error.flatten() });
}

// Service with null return
verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    return null;  // Silent fail, let caller decide handling
  }
}
```

## Logging

**Framework:** `console` object (standard Node.js)

**Patterns:**
- Use `console.log()` with context prefix in square brackets
  - Example: `console.log('[projects] created ${project.id} (${project.name})')`
  - Example: `console.error('Failed to persist new-plan stage metadata', error)`
- Suppress logging in Vitest runtime: Check `process.env.VITEST` flag
  - Example: `if (!isVitestRuntime) { console.log(...) }`
- Frontend uses `sonner` toast library for user-facing error messages, not console logs for errors

**No structured logging:** Logs are simple strings, no JSON formatting or external logging service integration

## Comments

**When to Comment:**
- Document module-level purpose with JSDoc block
- Explain non-obvious algorithm or business logic
- Mark intentional design decisions (e.g., "Be deliberately permissive on project creation/update so that frontend payload quirks never block the UI with 400s")
- Rarely use inline comments; prefer self-documenting code

**JSDoc/TSDoc:**
- Used extensively on public class methods and exported functions
- Format: Standard JSDoc with `/** ... */` blocks
- Includes: Description, parameters, return type, examples (sometimes)
- Location: `src/services/authService.ts` (good example of full JSDoc coverage)

**Example JSDoc:**
```typescript
/**
 * Hash a plaintext password using bcrypt
 */
async hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.bcryptRounds);
}

/**
 * Wraps an async Express route handler so rejected promises are forwarded
 * to the Express error handler instead of causing an unhandled rejection.
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
```

## Function Design

**Size:**
- Functions tend toward focused responsibility (50-100 lines is typical for route handlers)
- Large files (>350 lines) are actively refactored; recent work split bloated modules
- Test files often exceed this due to test case volume

**Parameters:**
- Destructured object parameters for functions with >2 parameters
- Example: `(projectId: string, phase: Phase)` is acceptable; 5+ params use object

**Return Values:**
- Explicit return types on all public functions
- Async functions return `Promise<T>`
- Null/undefined used for optional/missing values (not empty strings or zero-length arrays)
- API responses wrapped in JSON objects: `{ projects: [...] }`, `{ project: {...} }`

**Example Function:**
```typescript
export function registerProjectRoutes(router: Router, repository: ProjectRepository) {
  router.get('/projects/:id', async (req, res) => {
    const project = await repository.getById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    return res.json({ project });
  });
}
```

## Module Design

**Exports:**
- Named exports for functions and classes (most common)
- Default exports rare; used only for React components sometimes
- Backend typically exports functions that register routes or create instances (e.g., `registerProjectRoutes`, `authService`)

**Barrel Files:**
- Used in backend for grouping related exports
  - Example: `src/services/nlToSql/index.ts` exports multiple NL-to-SQL functions
  - Example: `src/services/llm/index.ts` exports LLM service functions
- Frontend uses barrel files for component organization
  - Example: `components/ui/index.ts` exports all UI primitives

**Singleton Pattern:**
- Services exported as singletons: `export const authService = new AuthService()`
- Zustand stores use `create()` returning a hook
- Used for dependency injection without a container framework

**Example Module Structure:**
```typescript
// src/services/authService.ts
export class AuthService {
  async hashPassword(password: string): Promise<string> { ... }
  generateAccessToken(user: SafeUser): string { ... }
}

export const authService = new AuthService();
```

## Type Definitions

**Location:** `src/types/` (backend) and `src/types/` (frontend)
- One file per domain: `auth.ts`, `user.ts`, `project.ts`, `dataset.ts`, `model.ts`
- Shared types at module level, not scattered in implementation files

**Conventions:**
- Extend Express `Request` for authenticated requests: `AuthRequest extends Request`
- Use discriminated unions for state machines: `type UploadFlowStage = 'upload' | 'processing' | 'chat'`
- Type guards for runtime validation: `function isValidUploadStage(value: unknown): value is UploadFlowStage { ... }`

**Example:**
```typescript
// src/types/auth.ts
export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: SafeUser;
}
```

---

*Convention analysis: 2026-03-13*
