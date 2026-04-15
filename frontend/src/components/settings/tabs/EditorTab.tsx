import { Monitor, Type, Zap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useEditorPrefsStore } from '@/stores/editorPrefsStore';

export function EditorTab() {
  const {
    fontSize, fontFamily, lineNumbers, minimap, wordWrap,
    autosaveDelay, tabSize, smoothCursor,
    setFontSize, setFontFamily, setLineNumbers, setMinimap, setWordWrap,
    setAutosaveDelay, setTabSize, setSmoothCursor,
  } = useEditorPrefsStore();

  return (
    <div className="space-y-8">
      <SettingsSection icon={Type} title="Font">
        <SettingsRow label="Font size" description="Size of text in code editors, in pixels" slider>
          <Slider
            min={10}
            max={24}
            step={1}
            value={[fontSize]}
            onValueChange={([v]) => setFontSize(v)}
            className="flex-1"
          />
          <span className="text-sm tabular-nums text-muted-foreground w-8 text-right">{fontSize}px</span>
        </SettingsRow>

        <SettingsRow label="Font family" description="Typeface used in code editors">
          <Select value={fontFamily} onValueChange={setFontFamily}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Monaspace Neon">Monaspace Neon</SelectItem>
              <SelectItem value="JetBrains Mono">JetBrains Mono</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection icon={Monitor} title="Display">
        <SettingsRow label="Line numbers" description="Show line numbers in the editor gutter (does not affect markdown cells)">
          <Switch
            checked={lineNumbers}
            onCheckedChange={setLineNumbers}
          />
        </SettingsRow>

        <SettingsRow label="Minimap" description="Show a miniature overview of the code on the right edge">
          <Switch
            checked={minimap}
            onCheckedChange={setMinimap}
          />
        </SettingsRow>

        <SettingsRow label="Word wrap" description="Wrap long lines instead of requiring horizontal scrolling">
          <Switch
            checked={wordWrap}
            onCheckedChange={setWordWrap}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection icon={Zap} title="Behavior">
        <SettingsRow label="Autosave delay" description="Idle time before unsaved changes are persisted" slider>
          <Slider
            min={200}
            max={5000}
            step={100}
            value={[autosaveDelay]}
            onValueChange={([v]) => setAutosaveDelay(v)}
            className="flex-1"
          />
          <span className="text-sm tabular-nums text-muted-foreground w-8 text-right">{autosaveDelay}ms</span>
        </SettingsRow>

        <SettingsRow label="Tab size" description="Number of spaces inserted when the Tab key is pressed">
          <Select
            value={String(tabSize)}
            onValueChange={(v) => setTabSize(Number(v))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="8">8</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow label="Smooth cursor" description="Animate cursor movement and use smooth blinking">
          <Switch
            checked={smoothCursor}
            onCheckedChange={setSmoothCursor}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
