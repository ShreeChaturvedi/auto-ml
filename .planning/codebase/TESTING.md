# Testing Patterns

**Analysis Date:** 2026-03-13

## Test Framework

**Runner:**
- `vitest` v4.0.18
- Config: `backend/vitest.config.ts`, `frontend/vitest.config.ts`

**Assertion Library:**
- `vitest` built-in expect + React Testing Library matchers

**Run Commands:**
```bash
npm test                  # Run all tests (backend + frontend)
npm run test:backend      # Backend tests only
npm run test:frontend     # Frontend tests only
npm run test:watch        # Watch mode (adds :watch suffix per workspace)
npm run test:coverage     # Coverage report (v8 provider)
```

**Environment:**
- **Backend:** Node.js environment
- **Frontend:** jsdom environment (browser DOM simulation)

## Test File Organization

**Location:**
- **Backend:** Co-located with source: `src/**/*.test.ts`
  - Example: `src/services/authService.test.ts` next to `src/services/authService.ts`
  - Utilities tests in subdirectory: `src/utils/__tests__/typeCoercion.test.ts`
- **Frontend:** Subdirectory `__tests__` within feature directory
  - Example: `src/components/upload/__tests__/UploadArea.test.tsx` next to `src/components/upload/UploadArea.tsx`
  - Type tests: `src/types/__tests__/nlQuery.test.ts`

**Naming:**
- `*.test.ts` for backend (TypeScript files)
- `*.test.tsx` for frontend (React components)

**Structure:**
```
backend/
├── src/
│   ├── services/
│   │   ├── authService.ts
│   │   └── authService.test.ts          # Co-located
│   └── utils/
│       ├── hash.ts
│       └── __tests__/
│           └── typeCoercion.test.ts     # In subdirectory

frontend/
├── src/
│   ├── components/
│   │   ├── upload/
│   │   │   ├── UploadArea.tsx
│   │   │   └── __tests__/
│   │   │       ├── UploadArea.test.tsx
│   │   │       ├── QuestionCards.test.tsx
│   │   │       └── ProjectHeader.test.tsx
│   │   └── ui/
│   │       └── __tests__/
│   │           ├── button.test.tsx
│   │           └── badge.test.tsx
```

## Test Structure

**Suite Organization:**
```typescript
describe('Component/Module Name', () => {
  // Setup
  beforeEach(() => {
    // Reset state before each test
  });

  // Grouped tests by feature/method
  describe('specific feature or method', () => {
    it('should [expected behavior]', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

**Patterns:**

**Backend Route Tests:**
```typescript
// src/routes/health.test.ts
import express, { Router } from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { describeRouteSuite } from '../tests/describeRouteSuite.js';
import { registerHealthRoutes } from './health.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerHealthRoutes(router);
  app.use('/api', router);
  return app;
}

describeRouteSuite('health routes', () => {
  describe('GET /api/health', () => {
    it('returns the expected health payload', async () => {
      const app = createTestApp();
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(typeof response.body.uptime).toBe('number');
    });
  });
});
```

**Backend Service Tests:**
```typescript
// src/services/authService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config module before importing service
vi.mock('../config.js', async () => {
  const actual = await vi.importActual<typeof import('../config.js')>('../config.js');
  return {
    ...actual,
    env: { ...actual.env, bcryptRounds: 4, jwtSecret: 'test-jwt-secret' }
  };
});

import { AuthService, authService } from './authService.js';

describe('authService', () => {
  let service: AuthService;
  const mockUser: SafeUser = { /* ... */ };

  beforeEach(() => {
    service = new AuthService();
  });

  describe('hashPassword', () => {
    it('returns a bcrypt hash', async () => {
      const hash = await service.hashPassword('mypassword123');
      expect(hash).toMatch(/^\$2[aby]?\$\d{1,2}\$/);
    });

    it('produces different hashes for same password (due to salt)', async () => {
      const hash1 = await service.hashPassword('samepassword');
      const hash2 = await service.hashPassword('samepassword');
      expect(hash1).not.toBe(hash2);
    });
  });
});
```

**Frontend Component Tests:**
```typescript
// src/components/upload/__tests__/UploadArea.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadArea } from '../UploadArea';

// Mock stores
vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeProjectId: 'p1',
      projects: [...],
      updateProject: vi.fn(() => Promise.resolve()),
      completePhase: vi.fn()
    })
}));

describe('UploadArea stage machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions upload -> processing -> chat', async () => {
    render(
      <MemoryRouter initialEntries={[`/project/p1/upload`]}>
        <Routes>
          <Route path="/project/:projectId/upload" element={<UploadArea />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('upload-stage-next')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('upload-stage-next'));

    await waitFor(() => {
      expect(screen.getByTestId('processing-complete')).toBeInTheDocument();
    });
  });
});
```

**Frontend Simple Component Tests:**
```typescript
// src/components/ui/__tests__/button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../button';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  describe('variants', () => {
    it('applies default variant styles', () => {
      render(<Button variant="default">Default</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary');
    });
  });
});
```

## Mocking

**Framework:** `vitest` built-in `vi` object

**Patterns:**

**Module Mocking:**
```typescript
// Mock before import
vi.mock('../config.js', async () => {
  const actual = await vi.importActual<typeof import('../config.js')>('../config.js');
  return { ...actual, env: { ...actual.env, bcryptRounds: 4 } };
});

import { env } from '../config.js';
```

**Function Mocking:**
```typescript
vi.mock('../services/authService.js', () => ({
  authService: {
    hashPassword: vi.fn(),
    generateAccessToken: vi.fn()
  }
}));

import { authService } from '../services/authService.js';
const mockHashPassword = vi.mocked(authService.hashPassword);
```

**Store Mocking (Frontend):**
```typescript
vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeProjectId: 'p1',
      projects: [],
      updateProject: updateProjectMock,
      completePhase: completePhaseMock
    })
}));
```

**Component Mocking (Frontend):**
```typescript
vi.mock('../UploadStage', () => ({
  UploadStage: ({ onNext }: { onNext: () => void }) => (
    <button type="button" data-testid="upload-stage-next" onClick={onNext}>Upload Next</button>
  )
}));
```

**What to Mock:**
- External dependencies (databases, HTTP clients, file system)
- Child components in isolation tests (for unit testing parent only)
- Config modules with environment-specific values
- Service layer dependencies when testing routes

**What NOT to Mock:**
- The component/function under test
- Utility functions (keep real to test actual behavior)
- React Router components (usually use MemoryRouter for integration)
- Built-in libraries (use real implementations)

## Fixtures and Factories

**Test Data:**

**Inline objects (common for simple cases):**
```typescript
const mockUser: SafeUser = {
  user_id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  email_verified: true,
  created_at: new Date(),
  updated_at: new Date(),
  last_login_at: null
};
```

**Test constants for repeated use:**
```typescript
const QUESTIONS: AskUserQuestion[] = [
  {
    id: 'q1',
    header: 'Target',
    question: 'What is the target type?',
    type: 'single_select',
    options: [
      { label: 'Binary', description: 'Two classes' },
      { label: 'Regression', description: 'Continuous target' }
    ]
  },
  // ...
];
```

**Location:**
- Fixtures defined at top of test file when used only in that file
- Shared test data could be extracted to `src/test/fixtures.ts` (not yet centralized in codebase)
- Mock user objects typically defined inline per test file

**Example Fixture:**
```typescript
function createTestApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerHealthRoutes(router);
  app.use('/api', router);
  return app;
}
```

## Coverage

**Requirements:** Not enforced by default, but configured

**Configuration (Frontend):**
- Provider: `v8`
- Reporters: `text`, `json`, `html`
- Include: `src/**/*.{ts,tsx}`
- Exclude: test files, type definitions, entry points

**View Coverage:**
```bash
npm run test:coverage      # Generates HTML report in coverage/ directory
```

**Coverage gaps:** Not systematically tracked; tests written for critical paths and new features

## Test Types

**Unit Tests:**
- **Scope:** Individual functions or small components
- **Approach:** Isolate with mocks, test single behavior per test
- **Example:** `authService.hashPassword()` tests, `Button` component tests
- **Location:** `src/**/*.test.ts` (co-located with source)

**Integration Tests:**
- **Scope:** Multiple modules together (routes + services, components + stores)
- **Approach:** Use real implementations where possible, mock only external services
- **Example:** Route handlers testing with real repository logic
- **Location:** Same as unit tests; distinguished by test name/describe block
- **Pattern:** Use `describeRouteSuite()` for route tests to handle port binding

**E2E Tests:**
- **Framework:** Playwright (not Vitest)
- **Location:** `testing/` directory
- **Run:** `npm run benchmark` (headless), `npm run benchmark:headed` (visible)
- **Scope:** Full user workflows from upload through experiments

## Common Patterns

**Async Testing:**
```typescript
// Simple async function
it('returns a bcrypt hash', async () => {
  const hash = await service.hashPassword('mypassword123');
  expect(hash).toMatch(/^\$2[aby]?\$\d{1,2}\$/);
});

// With waitFor for component state updates
await waitFor(() => {
  expect(updateProjectMock).toHaveBeenCalled();
});

// Promise.resolve for promise handling
return new Promise<boolean>((resolve) => {
  const server = net.createServer();
  server.once('error', () => { resolve(false); });
  server.listen(0, '127.0.0.1', () => {
    server.close(() => resolve(true));
  });
});
```

**Error Testing:**
```typescript
// Test error return (null)
it('returns null for invalid token', () => {
  const payload = service.verifyAccessToken('invalid.token.here');
  expect(payload).toBeNull();
});

// Test error rejection
it('rejects on invalid input', async () => {
  const mockFn = vi.fn().mockRejectedValue(new Error('Invalid'));
  await expect(mockFn()).rejects.toThrow('Invalid');
});

// Test HTTP error responses
it('returns 400 when projectId is missing', async () => {
  const app = createTestApp();
  const response = await request(app)
    .post('/api/query/sql')
    .send({ sql: 'SELECT 1' });
  expect(response.status).toBe(400);
  expect(response.body.errors).toBeDefined();
});
```

**Snapshot Testing:**
- Not used in this codebase

**Mocking Time:**
```typescript
// Setup: done automatically in test setup
// src/test/setup.ts clears timers after each test
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
```

**DOM Testing (Frontend):**
```typescript
// Query by accessible role (preferred)
const button = screen.getByRole('button', { name: 'Click me' });

// Query by test ID (when role unavailable)
const stage = screen.getByTestId('upload-stage-next');

// Query by label text
const input = screen.getByLabelText('Email');

// Assertion with accessibility roles
fireEvent.click(screen.getByRole('radio', { name: /Binary/i }));
expect(button).toHaveAttribute('aria-current', 'step');
```

## Test Utilities

**Route Testing Helper:**
```typescript
// src/tests/describeRouteSuite.ts
// Wraps describe() to skip route tests if port binding fails
export const describeRouteSuite = canBind ? describe : describe.skip;

// Usage: describeRouteSuite('route name', () => { ... })
```

**Test Setup Files:**

**Backend (`src/test/setup.ts`):**
```typescript
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
```

**Frontend (`src/test/setup.ts`):**
```typescript
// Cleanup after each test
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// Mock localStorage and sessionStorage
const localStorageMock = { getItem, setItem, removeItem, clear, length, key };

// Mock ResizeObserver and IntersectionObserver
class ResizeObserverMock { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); }
```

## Best Practices (from Codebase)

1. **Clear mocks between tests:** Always call `vi.clearAllMocks()` in `beforeEach()`
2. **Test behavior, not implementation:** Use `screen.getByRole()` instead of reaching into component internals
3. **Keep test files focused:** One primary component/module per test file
4. **Use descriptive test names:** "it('transitions upload -> processing -> chat')" is better than "it('works')"
5. **Avoid mocking internals:** If you're mocking the same module you're testing, refactor instead
6. **Group related tests:** Use nested `describe()` blocks to organize by feature/method
7. **Mock only at module boundary:** Mock external services (API, database), not internal utilities

---

*Testing analysis: 2026-03-13*
