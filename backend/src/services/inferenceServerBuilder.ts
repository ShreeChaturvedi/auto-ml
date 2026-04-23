import type { ModelRecord } from '../types/model.js';

/* ------------------------------------------------------------------ */
/*  Python literal helper (mirrors modelTraining.ts)                  */
/* ------------------------------------------------------------------ */

function pyLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(pyLiteral).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${JSON.stringify(key)}: ${pyLiteral(val)}`);
    return `{${entries.join(', ')}}`;
  }
  return JSON.stringify(String(value));
}

/* ------------------------------------------------------------------ */
/*  Field-name sanitisation                                           */
/* ------------------------------------------------------------------ */

/** Make a column name safe as a Python identifier. */
function sanitize(name: string): string {
  let safe = name.replace(/[\s\-./]+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
  if (/^\d/.test(safe)) safe = `f_${safe}`;
  if (safe === '') safe = 'field';
  return safe;
}

/** Build a deduplicated sanitised-name → original-name mapping. */
function buildFieldMap(columns: string[]): Map<string, string> {
  const seen = new Map<string, number>();
  const map = new Map<string, string>();
  for (const col of columns) {
    let safe = sanitize(col);
    const count = seen.get(safe) ?? 0;
    if (count > 0) safe = `${safe}_${count}`;
    seen.set(sanitize(col), count + 1);
    map.set(safe, col);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Python type mapping                                               */
/* ------------------------------------------------------------------ */

type FeatureType = 'float' | 'int' | 'str';

function pyType(ft: FeatureType): string {
  switch (ft) {
    case 'int':
      return 'int';
    case 'str':
      return 'str';
    default:
      return 'float';
  }
}

function defaultExample(ft: FeatureType): unknown {
  return ft === 'str' ? '' : 0;
}

/* ------------------------------------------------------------------ */
/*  Main builder                                                      */
/* ------------------------------------------------------------------ */

export function buildInferenceServerScript(model: ModelRecord): string {
  const features = model.featureColumns ?? [];
  const types = model.featureTypes ?? {};
  const sample = model.sampleRequest ?? {};
  const isClassification = model.taskType === 'classification';

  const fieldMap = buildFieldMap(features);

  // ---- Pydantic input model fields --------------------------------
  const inputFields: string[] = [];
  for (const [safe, orig] of fieldMap) {
    const ft: FeatureType = types[orig] ?? 'float';
    const ex = orig in sample ? sample[orig] : defaultExample(ft);
    inputFields.push(`    ${safe}: ${pyType(ft)} = Field(example=${pyLiteral(ex)})`);
  }

  // ---- Field-name remap dict (sanitised → original) ---------------
  const remapEntries = [...fieldMap]
    .filter(([safe, orig]) => safe !== orig)
    .map(([safe, orig]) => `${JSON.stringify(safe)}: ${JSON.stringify(orig)}`);
  const fieldMapLiteral =
    remapEntries.length > 0 ? `{${remapEntries.join(', ')}}` : '{}';

  // ---- Sample dict for warm-up ------------------------------------
  const sampleEntries = [...fieldMap].map(([, orig]) => {
    const ft: FeatureType = types[orig] ?? 'float';
    const val = orig in sample ? sample[orig] : defaultExample(ft);
    return `${JSON.stringify(orig)}: ${pyLiteral(val)}`;
  });
  const sampleDictLiteral = `{${sampleEntries.join(', ')}}`;

  // ---- Response model ---------------------------------------------
  const responseFields = isClassification
    ? [
        '    prediction: str',
        '    probabilities: dict = None',
        '    shap_values: list = None',
      ]
    : [
        '    prediction: float',
        '    prediction_interval: dict = None',
        '    shap_values: list = None',
      ];

  // ---- Assemble script --------------------------------------------
  const lines: string[] = [];
  const L = (s = '') => lines.push(s);

  // --- imports ---
  L('import json');
  L('import os');
  L('import time');
  L('from contextlib import asynccontextmanager');
  L('');
  L('import numpy as np');
  L('import pandas as pd');
  L('import joblib');
  L('from fastapi import FastAPI, HTTPException, Query');
  L('from pydantic import BaseModel, Field');
  L('import uvicorn');
  L('');

  // --- PredictionInput ---
  L('');
  L('class PredictionInput(BaseModel):');
  if (inputFields.length > 0) {
    for (const f of inputFields) L(f);
  } else {
    L('    pass');
  }
  L('');
  L('');

  // --- PredictionResponse ---
  L('class PredictionResponse(BaseModel):');
  for (const f of responseFields) L(f);
  L('');
  L('');

  // --- field map ---
  L(`FIELD_MAP = ${fieldMapLiteral}`);
  L('');
  L('');

  // --- pipeline helpers ---
  L('def resolve_model_step(pipeline):');
  L('    if hasattr(pipeline, "named_steps"):');
  L('        named_steps = getattr(pipeline, "named_steps", {}) or {}');
  L('        if "model" in named_steps:');
  L('            return named_steps["model"]');
  L('        ordered_steps = list(named_steps.values())');
  L('        if ordered_steps:');
  L('            return ordered_steps[-1]');
  L('    if hasattr(pipeline, "steps"):');
  L('        steps = getattr(pipeline, "steps", []) or []');
  L('        if steps:');
  L('            return steps[-1][1]');
  L('    return pipeline');
  L('');
  L('def resolve_classes(pipeline, probas=None):');
  L('    if hasattr(pipeline, "classes_"):');
  L('        return pipeline.classes_');
  L('    model_step = resolve_model_step(pipeline)');
  L('    if hasattr(model_step, "classes_"):');
  L('        return model_step.classes_');
  L('    if probas is not None:');
  L('        return list(range(len(probas)))');
  L('    return []');
  L('');
  L('');

  // --- lifespan ---
  L('app_state = {}');
  L('');
  L('');
  L('@asynccontextmanager');
  L('async def lifespan(app):');
  L('    pipeline = joblib.load("/model/model.joblib")');
  L('    app_state["pipeline"] = pipeline');
  L('');
  L('    # Cache SHAP explainer');
  L('    try:');
  L('        import shap');
  L('        model_step = resolve_model_step(pipeline)');
  L('        if hasattr(model_step, "estimators_") or hasattr(model_step, "get_booster"):');
  L('            app_state["explainer"] = shap.TreeExplainer(model_step)');
  L('        elif hasattr(model_step, "coef_"):');
  L('            app_state["explainer"] = None');
  L('        app_state["shap_available"] = True');
  L('    except Exception:');
  L('        app_state["shap_available"] = False');
  L('');
  L(`    sample = ${sampleDictLiteral}`);
  L('    df = pd.DataFrame([sample])');
  L('    pipeline.predict(df)');
  L('');
  L('    yield');
  L('    app_state.clear()');
  L('');
  L('');

  // --- app ---
  L('app = FastAPI(title="Inference Server", lifespan=lifespan)');
  L('');
  L('');

  // --- POST /predict ---
  L('@app.post("/predict", response_model=PredictionResponse)');
  L('async def predict(input_data: PredictionInput, explain: bool = Query(False)):');
  L('    pipeline = app_state["pipeline"]');
  L('');
  L('    data = input_data.model_dump()');
  L('    row = {FIELD_MAP.get(k, k): v for k, v in data.items()}');
  L('    df = pd.DataFrame([row])');
  L('');
  L('    prediction = pipeline.predict(df)[0]');
  L('    result = {}');
  L('');
  if (isClassification) {
    L('    if hasattr(pipeline, "predict_proba"):');
    L('        probas = pipeline.predict_proba(df)[0]');
    L('        classes = resolve_classes(pipeline, probas)');
    L('        result["prediction"] = str(prediction)');
    L('        result["probabilities"] = {str(c): float(p) for c, p in zip(classes, probas)}');
    L('    else:');
    L('        result["prediction"] = str(prediction)');
  } else {
    L('    result["prediction"] = float(prediction)');
  }
  L('');
  L('    if explain and app_state.get("shap_available"):');
  L('        try:');
  L('            explainer = app_state.get("explainer")');
  L('            if explainer is not None:');
  L('                preprocessor = pipeline.named_steps["preprocessor"]');
  L('                X_transformed = preprocessor.transform(df)');
  L('                shap_vals = explainer.shap_values(X_transformed)');
  L('                if isinstance(shap_vals, list):');
  L('                    shap_vals = shap_vals[0]');
  L('                if hasattr(shap_vals, "values"):');
  L('                    shap_vals = shap_vals.values');
  L('                feature_names = preprocessor.get_feature_names_out().tolist()');
  L('                result["shap_values"] = [');
  L('                    {"feature": fn, "value": float(sv)}');
  L('                    for fn, sv in zip(feature_names, shap_vals[0])');
  L('                ]');
  L('        except Exception:');
  L('            pass');
  L('');
  L('    return result');
  L('');
  L('');

  // --- POST /predict/batch ---
  L('@app.post("/predict/batch")');
  L('async def predict_batch(inputs: list[PredictionInput]):');
  L('    pipeline = app_state["pipeline"]');
  L('    rows = []');
  L('    for inp in inputs:');
  L('        data = inp.model_dump()');
  L('        row = {FIELD_MAP.get(k, k): v for k, v in data.items()}');
  L('        rows.append(row)');
  L('    df = pd.DataFrame(rows)');
  L('    predictions = pipeline.predict(df)');
  L('');
  L('    results = []');
  if (isClassification) {
    L('    if hasattr(pipeline, "predict_proba"):');
    L('        probas = pipeline.predict_proba(df)');
    L('        classes = resolve_classes(pipeline, probas[0] if len(probas) > 0 else None)');
    L('        for i, pred in enumerate(predictions):');
    L('            results.append({');
    L('                "prediction": str(pred),');
    L('                "probabilities": {str(c): float(p) for c, p in zip(classes, probas[i])}');
    L('            })');
    L('    else:');
    L('        for pred in predictions:');
    L('            results.append({"prediction": str(pred)})');
  } else {
    L('    for pred in predictions:');
    L('        results.append({"prediction": float(pred)})');
  }
  L('');
  L('    return results');
  L('');
  L('');

  // --- Health probes ---
  L('@app.get("/health/live")');
  L('async def health_live():');
  L('    return {"status": "alive"}');
  L('');
  L('');
  L('@app.get("/health/ready")');
  L('async def health_ready():');
  L('    if "pipeline" not in app_state:');
  L('        raise HTTPException(status_code=503, detail="Model not loaded")');
  L('    return {"status": "ready"}');
  L('');
  L('');
  L('@app.get("/health/startup")');
  L('async def health_startup():');
  L('    return {"status": "starting" if "pipeline" not in app_state else "ready"}');
  L('');
  L('');

  // --- main ---
  L('if __name__ == "__main__":');
  L('    uvicorn.run(app, host="0.0.0.0", port=8000)');
  L('');

  return lines.join('\n');
}
