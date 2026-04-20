import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import fetch from 'node-fetch';

interface Nl2SqlCase {
  prompt: string;
  expectedSql: string;
  projectId: string;
}

interface RagCase {
  question: string;
  expectedPhrases: string[];
  projectId: string;
}

interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

// Mirrors the registerTestUser pattern in smoke-full-path.spec.ts.
// /query/nl and /answer both require a valid Authorization header; the
// evalRunner originally predated the JWT enforcement and has been returning
// 401 for every case. Register a throwaway user once per run and thread the
// access token through the two evaluators.
async function registerEvalUser(baseUrl: string): Promise<string> {
  const email = `eval-${randomUUID()}@automl.test`;
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'EvalRunner2026!', name: 'Eval Runner' })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Eval auth registration failed: ${response.status} ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as RegisterResponse;
  if (!data.accessToken) {
    throw new Error('Eval auth registration returned no accessToken');
  }
  return data.accessToken;
}

async function runNl2SqlEval(baseUrl: string, accessToken: string) {
  const cases = JSON.parse(readFileSync(new URL('../fixtures/nl2sql_eval.json', import.meta.url), 'utf8')) as Nl2SqlCase[];
  let passes = 0;
  for (const testCase of cases) {
    const response = await fetch(`${baseUrl}/query/nl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ projectId: testCase.projectId, query: testCase.prompt })
    });
    if (!response.ok) {
      throw new Error(`NL2SQL request failed with status ${response.status}`);
    }
    const data = (await response.json()) as { nl: { sql: string } };
    if (data.nl.sql.trim().toLowerCase() === testCase.expectedSql.trim().toLowerCase()) {
      passes += 1;
    } else {
      console.warn(`[nl2sql] mismatch for "${testCase.prompt}": expected "${testCase.expectedSql}", got "${data.nl.sql}"`);
    }
  }
  console.log(`[nl2sql] Passed ${passes}/${cases.length}`);
}

async function runRagEval(baseUrl: string, accessToken: string) {
  const cases = JSON.parse(readFileSync(new URL('../fixtures/rag_eval.json', import.meta.url), 'utf8')) as RagCase[];
  let passes = 0;
  for (const testCase of cases) {
    const response = await fetch(`${baseUrl}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ projectId: testCase.projectId, question: testCase.question, topK: 3 })
    });
    if (!response.ok) {
      throw new Error(`Answer request failed with status ${response.status}`);
    }
    const data = (await response.json()) as { answer: { status: string; answer: string } };
    if (data.answer.status !== 'ok') {
      console.warn(`[rag] no answer for "${testCase.question}"`);
      continue;
    }
    const matches = testCase.expectedPhrases.every((phrase) =>
      data.answer.answer.toLowerCase().includes(phrase.toLowerCase())
    );
    if (matches) {
      passes += 1;
    } else {
      console.warn(`[rag] mismatch for "${testCase.question}" => ${data.answer.answer}`);
    }
  }
  console.log(`[rag] Passed ${passes}/${cases.length}`);
}

async function main() {
  const baseUrl = process.env.EVAL_API_BASE ?? 'http://localhost:4000/api';
  const accessToken = await registerEvalUser(baseUrl);
  await runNl2SqlEval(baseUrl, accessToken);
  await runRagEval(baseUrl, accessToken);
}

main().catch((error) => {
  console.error('[eval] failed', error);
  process.exitCode = 1;
});
