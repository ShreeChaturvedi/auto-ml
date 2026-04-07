-- Deployments
CREATE TABLE IF NOT EXISTS deployments (
  deployment_id TEXT PRIMARY KEY,
  model_id      TEXT NOT NULL REFERENCES models(model_id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'creating'
                CHECK (status IN ('creating','starting','healthy','unhealthy','stopping','stopped','failed')),
  container_id  TEXT,
  port          INTEGER,
  endpoint_url  TEXT,
  error_message TEXT,
  config        JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  stopped_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_model ON deployments(model_id);

-- Prediction logs
CREATE TABLE IF NOT EXISTS prediction_logs (
  id              BIGSERIAL PRIMARY KEY,
  deployment_id   TEXT NOT NULL REFERENCES deployments(deployment_id) ON DELETE CASCADE,
  model_id        TEXT NOT NULL,
  project_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latency_ms      INTEGER,
  input_features  JSONB NOT NULL,
  prediction      JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'success',
  error_message   TEXT,
  feedback        TEXT,
  feedback_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_pred_logs_deploy_time ON prediction_logs(deployment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pred_logs_project ON prediction_logs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pred_logs_errors ON prediction_logs(deployment_id, created_at DESC) WHERE status = 'error';

-- Hourly stats summary (pre-aggregated for monitoring queries)
CREATE TABLE IF NOT EXISTS deployment_stats_hourly (
  deployment_id TEXT NOT NULL REFERENCES deployments(deployment_id) ON DELETE CASCADE,
  hour_bucket   TIMESTAMPTZ NOT NULL,
  request_count INTEGER DEFAULT 0,
  error_count   INTEGER DEFAULT 0,
  latency_p50   INTEGER,
  latency_p95   INTEGER,
  latency_p99   INTEGER,
  latency_avg   INTEGER,
  PRIMARY KEY (deployment_id, hour_bucket)
);

-- API keys
CREATE TABLE IF NOT EXISTS deployment_api_keys (
  key_id          TEXT PRIMARY KEY,
  deployment_id   TEXT NOT NULL REFERENCES deployments(deployment_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,
  key_hash        TEXT NOT NULL,
  key_salt        TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);
