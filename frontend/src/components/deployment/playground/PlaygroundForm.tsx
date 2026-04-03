import { useMemo, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeploymentSchema } from '@/types/deployment';

interface PlaygroundFormProps {
  schema: DeploymentSchema;
  values: Record<string, unknown>;
  onChange: (feature: string, value: unknown) => void;
}

const TOP_FEATURE_COUNT = 8;
const RADIO_THRESHOLD = 4;
const SELECT_THRESHOLD = 15;

/** Sort features by importance, splitting into top vs. rest when there are many. */
function partitionFeatures(schema: DeploymentSchema) {
  const sorted = [...schema.featureColumns].sort((a, b) => {
    const ia = schema.featureImportance.find((f) => f.name === a)?.importance ?? 0;
    const ib = schema.featureImportance.find((f) => f.name === b)?.importance ?? 0;
    return ib - ia;
  });

  if (sorted.length <= TOP_FEATURE_COUNT * 2.5) {
    return { top: sorted, rest: [] };
  }
  return { top: sorted.slice(0, TOP_FEATURE_COUNT), rest: sorted.slice(TOP_FEATURE_COUNT) };
}

function NumericField({
  feature,
  value,
  range,
  type,
  onChange,
}: {
  feature: string;
  value: unknown;
  range?: { min: number; max: number };
  type: 'float' | 'int';
  onChange: (feature: string, value: unknown) => void;
}) {
  const numValue = typeof value === 'number' ? value : 0;
  const step = type === 'int' ? 1 : (range ? (range.max - range.min) / 100 : 0.01);

  if (range) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Slider
            className="flex-1"
            min={range.min}
            max={range.max}
            step={step}
            value={[numValue]}
            onValueChange={([v]) => onChange(feature, type === 'int' ? Math.round(v) : v)}
          />
          <Input
            type="number"
            className="h-8 w-20 text-xs tabular-nums"
            step={step}
            min={range.min}
            max={range.max}
            value={numValue}
            onChange={(e) => {
              const parsed = type === 'int' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
              if (!Number.isNaN(parsed)) onChange(feature, parsed);
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>{range.min}</span>
          <span>{range.max}</span>
        </div>
      </div>
    );
  }

  return (
    <Input
      type="number"
      className="h-8 text-xs tabular-nums"
      step={step}
      value={numValue}
      onChange={(e) => {
        const parsed = type === 'int' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
        if (!Number.isNaN(parsed)) onChange(feature, parsed);
      }}
    />
  );
}

function CategoricalField({
  feature,
  value,
  options,
  onChange,
}: {
  feature: string;
  value: unknown;
  options: string[];
  onChange: (feature: string, value: unknown) => void;
}) {
  const strValue = String(value ?? '');

  // <=4 values: radio group
  if (options.length <= RADIO_THRESHOLD) {
    return (
      <RadioGroup value={strValue} onValueChange={(v) => onChange(feature, v)}>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {options.map((opt) => (
            <div key={opt} className="flex items-center gap-1.5">
              <RadioGroupItem value={opt} id={`${feature}-${opt}`} />
              <Label htmlFor={`${feature}-${opt}`} className="text-xs font-normal cursor-pointer">
                {opt}
              </Label>
            </div>
          ))}
        </div>
      </RadioGroup>
    );
  }

  // 5-15 values: select dropdown
  if (options.length <= SELECT_THRESHOLD) {
    return (
      <Select value={strValue} onValueChange={(v) => onChange(feature, v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt} className="text-xs">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // 15+ values: popover + command (combobox)
  return <ComboboxField feature={feature} value={strValue} options={options} onChange={onChange} />;
}

function ComboboxField({
  feature,
  value,
  options,
  onChange,
}: {
  feature: string;
  value: string;
  options: string[];
  onChange: (feature: string, value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between text-xs font-normal"
        >
          {value || 'Select...'}
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${feature}...`} className="text-xs" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(v) => {
                    onChange(feature, v);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn('mr-2 h-3 w-3', value === opt ? 'opacity-100' : 'opacity-0')} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FeatureWidget({
  feature,
  schema,
  value,
  onChange,
}: {
  feature: string;
  schema: DeploymentSchema;
  value: unknown;
  onChange: (feature: string, value: unknown) => void;
}) {
  const type = schema.featureTypes[feature];
  const range = schema.featureRanges[feature];
  const categoricalOptions = schema.categoricalValues[feature];

  if (type === 'str' && categoricalOptions?.length) {
    return (
      <CategoricalField
        feature={feature}
        value={value}
        options={categoricalOptions}
        onChange={onChange}
      />
    );
  }

  return (
    <NumericField
      feature={feature}
      value={value}
      range={range}
      type={type === 'int' ? 'int' : 'float'}
      onChange={onChange}
    />
  );
}

function FeatureRow({
  feature,
  schema,
  value,
  onChange,
}: {
  feature: string;
  schema: DeploymentSchema;
  value: unknown;
  onChange: (feature: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{feature}</Label>
      <FeatureWidget feature={feature} schema={schema} value={value} onChange={onChange} />
    </div>
  );
}

export function PlaygroundForm({ schema, values, onChange }: PlaygroundFormProps) {
  const { top, rest } = useMemo(() => partitionFeatures(schema), [schema]);

  return (
    <div className="space-y-4">
      {top.map((feature) => (
        <FeatureRow
          key={feature}
          feature={feature}
          schema={schema}
          value={values[feature]}
          onChange={onChange}
        />
      ))}

      {rest.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="other" className="border-none">
            <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
              Other Features ({rest.length})
            </AccordionTrigger>
            <AccordionContent className="space-y-4">
              {rest.map((feature) => (
                <FeatureRow
                  key={feature}
                  feature={feature}
                  schema={schema}
                  value={values[feature]}
                  onChange={onChange}
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
