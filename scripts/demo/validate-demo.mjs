const backendBase = process.env.DEMO_API_BASE ?? 'http://localhost:4000/api';
const frontendBase = process.env.DEMO_FRONTEND_BASE ?? 'http://localhost:5173';

const demoUsers = [
  { email: 'aesh800110@gmail.com', password: 'Test@12345' },
  { email: 'yadava5@miamioh.edu', password: 'Test@12345' },
  { email: 'aesh_1055@icloud.com', password: 'Test@12345' }
];

async function expectOk(response, context) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${context} failed: ${response.status} ${body}`);
  }
}

async function main() {
  const healthResponse = await fetch(`${backendBase}/health`);
  await expectOk(healthResponse, 'backend health');
  const health = await healthResponse.json();
  if (health?.status !== 'ok') {
    throw new Error(`backend health payload not ok: ${JSON.stringify(health)}`);
  }
  console.log('[demo-validate] backend health ok');

  const frontendResponse = await fetch(frontendBase);
  await expectOk(frontendResponse, 'frontend root');
  const html = await frontendResponse.text();
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('frontend root did not return the expected app shell');
  }
  console.log('[demo-validate] frontend root ok');

  for (const user of demoUsers) {
    const response = await fetch(`${backendBase}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password
      })
    });
    await expectOk(response, `login for ${user.email}`);
    const payload = await response.json();
    if (!payload?.user?.email_verified) {
      throw new Error(`login for ${user.email} returned an unverified user`);
    }
    console.log(`[demo-validate] login ok for ${user.email}`);
  }

  console.log(`[demo-validate] app ready: ${frontendBase}`);
}

main().catch((error) => {
  console.error(`[demo-validate] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
