import { useState, useEffect, useCallback } from 'react';
import { Copy, Plus, Trash2, Key, Check, AlertTriangle, Loader2, AlertCircle } from 'lucide-react';
import { DeployEmptyIllustration } from '@/components/ui/illustrations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { DeploymentRecord, DeploymentApiKeyInfo, DeploymentSchema } from '@/types/deployment';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getDeploymentSchema,
  getDeploymentEndpointUrl
} from '@/lib/api/deployments';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Snippet builders                                                   */
/* ------------------------------------------------------------------ */

const curlSnippet = (url: string, sample: Record<string, unknown>) =>
  `curl -X POST ${url}/predict \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '${JSON.stringify(sample, null, 2)}'`;

const pythonSnippet = (url: string, sample: Record<string, unknown>) =>
  `import requests

response = requests.post(
    "${url}/predict",
    headers={"X-API-Key": "YOUR_API_KEY"},
    json=${JSON.stringify(sample, null, 4)}
)
print(response.json())`;

const jsSnippet = (url: string, sample: Record<string, unknown>) =>
  `const response = await fetch("${url}/predict", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_API_KEY",
  },
  body: JSON.stringify(${JSON.stringify(sample, null, 2)}),
});
const result = await response.json();
console.log(result);`;

/* ------------------------------------------------------------------ */
/*  Copy button                                                        */
/* ------------------------------------------------------------------ */

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('h-7 w-7 p-0', className)}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/*  Code block                                                         */
/* ------------------------------------------------------------------ */

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative rounded-md border bg-muted/40">
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 pr-10 font-mono text-xs leading-relaxed text-foreground">
        {code}
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Snippets section                                                   */
/* ------------------------------------------------------------------ */

function SnippetsSection({ deployment, schema }: { deployment: DeploymentRecord; schema: DeploymentSchema | null }) {
  const url = getDeploymentEndpointUrl(deployment.deploymentId, deployment.endpointUrl);
  const sample: Record<string, unknown> = schema?.sampleRequest ?? { feature1: 0, feature2: 0 };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Code Snippets</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="curl">
          <TabsList className="mb-4 h-8">
            <TabsTrigger value="curl" className="px-3 text-xs">curl</TabsTrigger>
            <TabsTrigger value="python" className="px-3 text-xs">Python</TabsTrigger>
            <TabsTrigger value="js" className="px-3 text-xs">JavaScript</TabsTrigger>
          </TabsList>
          <TabsContent value="curl">
            <CodeBlock code={curlSnippet(url, sample)} />
          </TabsContent>
          <TabsContent value="python">
            <CodeBlock code={pythonSnippet(url, sample)} />
          </TabsContent>
          <TabsContent value="js">
            <CodeBlock code={jsSnippet(url, sample)} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Revoke confirmation dialog                                         */
/* ------------------------------------------------------------------ */

function RevokeDialog({
  apiKey,
  onRevoke,
}: {
  apiKey: DeploymentApiKeyInfo;
  onRevoke: (keyId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRevoke = useCallback(async () => {
    setLoading(true);
    try {
      await onRevoke(apiKey.keyId);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [apiKey.keyId, onRevoke]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Revoke API Key</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Revoking <span className="font-mono font-medium text-foreground">{apiKey.keyPrefix}••••</span> (
          {apiKey.name}) will immediately invalidate it. This cannot be undone.
        </p>
        <DialogFooter className="mt-2 gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="text-xs">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            className="text-xs"
            disabled={loading}
            onClick={handleRevoke}
          >
            {loading && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Revoke Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  New-key revealed dialog                                            */
/* ------------------------------------------------------------------ */

interface NewKeyBannerProps {
  rawKey: string;
  keyName: string;
  onDismiss: () => void;
}

function NewKeyBanner({ rawKey, keyName, onDismiss }: NewKeyBannerProps) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="mb-2 flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Copy your key now — it won&apos;t be shown again
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Key <span className="font-medium">{keyName}</span> was created successfully.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded border border-amber-200 bg-white px-3 py-2 dark:border-amber-800/40 dark:bg-amber-950/40">
        <code className="flex-1 break-all font-mono text-xs text-foreground">{rawKey}</code>
        <CopyButton text={rawKey} className="shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-400" />
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDismiss}>
          I&apos;ve saved it
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  API keys section                                                   */
/* ------------------------------------------------------------------ */

function ApiKeysSection({ deployment }: { deployment: DeploymentRecord }) {
  const [keys, setKeys] = useState<DeploymentApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [newRawKey, setNewRawKey] = useState<{ raw: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFetchError(null);
    listApiKeys(deployment.deploymentId)
      .then(({ keys: k }) => { if (!cancelled) setKeys(k); })
      .catch((err) => { if (!cancelled) setFetchError(err instanceof Error ? err.message : 'Failed to load keys'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [deployment.deploymentId]);

  const handleGenerate = useCallback(async () => {
    if (!newKeyName.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const { key, rawKey } = await createApiKey(deployment.deploymentId, newKeyName.trim());
      setKeys((prev) => [key, ...prev]);
      setNewRawKey({ raw: rawKey, name: key.name });
      setGenerateOpen(false);
      setNewKeyName('');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate key');
    } finally {
      setGenerating(false);
    }
  }, [deployment.deploymentId, newKeyName]);

  const handleRevoke = useCallback(async (keyId: string) => {
    await revokeApiKey(deployment.deploymentId, keyId);
    setKeys((prev) => prev.filter((k) => k.keyId !== keyId));
  }, [deployment.deploymentId]);

  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">API Keys</CardTitle>
          <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Generate Key
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">Generate API Key</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label htmlFor="key-name" className="mb-1.5 block text-xs text-muted-foreground">
                    Key name
                  </label>
                  <Input
                    id="key-name"
                    placeholder="e.g. production-app"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
                    className="h-8 text-xs"
                    autoFocus
                  />
                </div>
                {generateError && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {generateError}
                  </p>
                )}
              </div>
              <DialogFooter className="mt-2 gap-2">
                <DialogClose asChild>
                  <Button variant="outline" size="sm" className="text-xs">Cancel</Button>
                </DialogClose>
                <Button
                  size="sm"
                  className="text-xs"
                  disabled={!newKeyName.trim() || generating}
                  onClick={handleGenerate}
                >
                  {generating && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  Generate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Revealed key banner */}
        {newRawKey && (
          <NewKeyBanner
            rawKey={newRawKey.raw}
            keyName={newRawKey.name}
            onDismiss={() => setNewRawKey(null)}
          />
        )}

        {/* Keys list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : fetchError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {fetchError}
          </div>
        ) : activeKeys.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center empty-state-enter">
            <DeployEmptyIllustration className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No API keys yet. Generate one to start authenticating requests.</p>
          </div>
        ) : (
          <div className="divide-y rounded-md border">
            {activeKeys.map((key) => (
              <div key={key.keyId} className="flex items-center gap-3 px-3 py-2.5">
                <Key className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium">{key.name}</span>
                    <Badge variant="outline" className="h-4 shrink-0 px-1.5 font-mono text-[10px]">
                      {key.keyPrefix}••••
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastUsedAt && (
                      <> · Last used {new Date(key.lastUsedAt).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <RevokeDialog apiKey={key} onRevoke={handleRevoke} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface ApiTabProps {
  deployment: DeploymentRecord;
}

export function ApiTab({ deployment }: ApiTabProps) {
  const [schema, setSchema] = useState<DeploymentSchema | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDeploymentSchema(deployment.deploymentId)
      .then((s) => { if (!cancelled) setSchema(s); })
      .catch(() => { /* snippets fall back to placeholder sample */ });
    return () => { cancelled = true; };
  }, [deployment.deploymentId]);

  return (
    <div className="space-y-6">
      <SnippetsSection deployment={deployment} schema={schema} />
      <ApiKeysSection deployment={deployment} />
    </div>
  );
}
