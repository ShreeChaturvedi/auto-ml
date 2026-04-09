import { useState, useEffect, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { Cpu, TerminalSquare, Loader2 } from 'lucide-react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { SaveButton, type ButtonState } from '@/components/settings/SaveButton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { fetchSettings, patchSettings } from '@/lib/api/settings';
import {
  getChartHeightPref,
  setChartHeightPref,
  subscribeChartHeightPref,
  getMaxOutputHeightPref,
  setMaxOutputHeightPref,
  subscribeMaxOutputHeightPref,
  getAutoScrollOutputPref,
  setAutoScrollOutputPref,
  subscribeAutoScrollOutputPref,
} from '@/lib/executionPrefs';

const executionSettingsSchema = z.object({
  executionTimeoutMs: z.number().int().min(5_000).max(120_000),
  executionMaxMemoryMb: z.number().int().min(256).max(4_096),
});

export function ExecutionTab() {
  const [timeoutMs, setTimeoutMs] = useState(30_000);
  const [maxMemoryMb, setMaxMemoryMb] = useState(512);
  const [loadingServer, setLoadingServer] = useState(true);
  const [saveState, setSaveState] = useState<ButtonState>('idle');

  const chartHeight = useSyncExternalStore(subscribeChartHeightPref, getChartHeightPref);
  const maxOutputHeight = useSyncExternalStore(subscribeMaxOutputHeightPref, getMaxOutputHeightPref);
  const autoScroll = useSyncExternalStore(subscribeAutoScrollOutputPref, getAutoScrollOutputPref);

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setTimeoutMs(s.executionTimeoutMs);
        setMaxMemoryMb(s.executionMaxMemoryMb);
      })
      .finally(() => setLoadingServer(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const result = executionSettingsSchema.safeParse({
      executionTimeoutMs: timeoutMs,
      executionMaxMemoryMb: maxMemoryMb,
    });
    if (!result.success) return;

    setSaveState('loading');
    try {
      const updated = await patchSettings(result.data);
      setTimeoutMs(updated.executionTimeoutMs);
      setMaxMemoryMb(updated.executionMaxMemoryMb);
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 2000);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSave}>
        <div className="mb-3">
          <SettingsSection icon={Cpu} title="Resource Limits">
            {loadingServer ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <SettingsRow
                  label="Execution timeout"
                  description="Maximum time a code cell can run before being terminated"
                  htmlFor="execution-timeout"
                >
                  <Input
                    id="execution-timeout"
                    type="number"
                    min={5000}
                    max={120000}
                    step={1000}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                    className="w-[120px] text-right"
                  />
                </SettingsRow>

                <SettingsRow
                  label="Max memory"
                  description="Maximum memory allocated to a code execution session"
                  htmlFor="execution-max-memory"
                >
                  <Input
                    id="execution-max-memory"
                    type="number"
                    min={256}
                    max={4096}
                    step={256}
                    value={maxMemoryMb}
                    onChange={(e) => setMaxMemoryMb(Number(e.target.value))}
                    className="w-[120px] text-right"
                  />
                </SettingsRow>
              </>
            )}
          </SettingsSection>
        </div>

        <div className="flex justify-end">
          <SaveButton
            state={loadingServer ? 'loading' : saveState}
            idleText="Save Execution Settings"
            loadingText="Saving..."
          />
        </div>
      </form>

      <SettingsSection icon={TerminalSquare} title="Notebook Output">
        <SettingsRow label="Default chart height" description="Height of chart outputs in notebook cells" slider>
          <Slider
            min={200}
            max={600}
            step={20}
            value={[chartHeight]}
            onValueChange={([v]) => setChartHeightPref(v)}
            className="flex-1"
          />
          <span className="text-sm tabular-nums text-muted-foreground w-16 text-right">{chartHeight}px</span>
        </SettingsRow>

        <SettingsRow label="Max output height" description="Clip tall cell outputs beyond this height" slider>
          <Slider
            min={0}
            max={1000}
            step={50}
            value={[maxOutputHeight]}
            onValueChange={([v]) => setMaxOutputHeightPref(v)}
            className="flex-1"
          />
          <span className="text-sm tabular-nums text-muted-foreground w-16 text-right">
            {maxOutputHeight === 0 ? 'Unlimited' : `${maxOutputHeight}px`}
          </span>
        </SettingsRow>

        <SettingsRow
          label="Auto-scroll to output"
          description="Scroll the notebook view to show cell output when execution completes"
          htmlFor="auto-scroll-output"
        >
          <Switch
            id="auto-scroll-output"
            checked={autoScroll}
            onCheckedChange={setAutoScrollOutputPref}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
