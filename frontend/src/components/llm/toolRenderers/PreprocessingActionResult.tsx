import { cn } from '@/lib/utils';
import { asBoolean, asNumber, asRecord, asString } from '@/lib/typeCoercion';
import type { ToolCall } from '@/types/llmUi';

export function PreprocessingActionResult({ call, output }: { call: ToolCall; output: unknown }) {
  const out = asRecord(output);
  const step = asRecord(out.step);
  const source = Object.keys(step).length > 0 ? step : out;
  const validation = asRecord(source.validation);

  const title = asString(source.title)
    ?? asString(call.args?.title)
    ?? asString(source.intentType)
    ?? asString(call.args?.intentType)
    ?? 'transformation step';
  const stepId = asString(source.stepId) ?? asString(call.args?.stepId);
  const status = asString(source.status) ?? asString(out.status);
  const rationale = asString(source.rationale) ?? asString(call.args?.rationale);
  const requiresApproval = asBoolean(source.requiresApproval) ?? asBoolean(call.args?.requiresApproval);
  const rowBefore = asNumber(validation.rowCountBefore);
  const rowAfter = asNumber(validation.rowCountAfter);
  const schemaDrift = asBoolean(validation.schemaDrift);
  const validationNotes = asString(validation.notes);
  const succeeded = asBoolean(out.succeeded) ?? asBoolean(source.lastExecuteSucceeded);
  const checkpointId = asString(out.checkpointId);
  const compatible = asBoolean(out.compatible);

  if (call.tool === 'checkpoint_dataset') {
    return (
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <p className="text-foreground font-medium">Checkpoint created for current dataset lineage.</p>
        {checkpointId ? <p>Checkpoint ID: <span className="font-mono">{checkpointId}</span></p> : null}
        {compatible != null ? (
          <p>Replay compatibility: <span className={cn(compatible ? 'text-emerald-600' : 'text-amber-600')}>{compatible ? 'passed' : 'needs review'}</span></p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <p className="text-foreground font-medium">{title}</p>
      {stepId ? <p>Step ID: <span className="font-mono">{stepId}</span></p> : null}
      {status ? <p>Status: <span className="capitalize">{status.replaceAll('_', ' ')}</span></p> : null}
      {rationale ? <p>Reasoning: {rationale}</p> : null}
      {succeeded != null && call.tool === 'execute_transformation_step' ? (
        <p>Execution result: <span className={cn(succeeded ? 'text-emerald-600' : 'text-destructive')}>{succeeded ? 'success' : 'failed'}</span></p>
      ) : null}
      {rowBefore != null && rowAfter != null ? (
        <p>
          Rows checked: {rowBefore.toLocaleString()}
          {' -> '}
          {rowAfter.toLocaleString()}
        </p>
      ) : null}
      {schemaDrift != null ? <p>Schema drift: {schemaDrift ? 'detected' : 'not detected'}</p> : null}
      {validationNotes ? <p>Validation notes: {validationNotes}</p> : null}
      {requiresApproval != null ? <p>Approval required: {requiresApproval ? 'yes' : 'no'}</p> : null}
      {call.tool === 'materialize_step_code' ? (
        <p>Executable notebook code was prepared for this step.</p>
      ) : null}
      {call.tool === 'commit_transformation_step' ? (
        <p>Step committed to preprocessing lineage and replay graph.</p>
      ) : null}
    </div>
  );
}
