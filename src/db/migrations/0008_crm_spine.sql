-- Migration: CRM Spine (Customer Scores, Pipeline Hygiene, Tasks)
-- Description: Adds thin CRM layer for scoring, pipeline tracking, and workflow triggers

-- 1. Add churn_risk enum
DO $$ BEGIN
  CREATE TYPE ticketing_prod.churn_risk_enum AS ENUM ('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create customer_scores table
CREATE TABLE IF NOT EXISTS ticketing_prod.customer_scores (
  customer_id INTEGER PRIMARY KEY REFERENCES ticketing_prod.customers(id) ON DELETE CASCADE,

  -- RFM scores (1-5 quintiles)
  r_score INTEGER NOT NULL,
  f_score INTEGER NOT NULL,
  m_score INTEGER NOT NULL,

  -- Money
  ltv DECIMAL(14, 2) NOT NULL DEFAULT 0,
  last_12_months_revenue DECIMAL(14, 2) NOT NULL DEFAULT 0,

  -- Health indicators
  health_score INTEGER NOT NULL,  -- 0-100
  churn_risk ticketing_prod.churn_risk_enum NOT NULL,
  previous_churn_risk ticketing_prod.churn_risk_enum,  -- for detecting escalations

  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_scores_health ON ticketing_prod.customer_scores(health_score);
CREATE INDEX IF NOT EXISTS idx_customer_scores_churn_risk ON ticketing_prod.customer_scores(churn_risk);

-- 3. Add pipeline hygiene fields to opportunities
ALTER TABLE ticketing_prod.opportunities
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS expected_close_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_opportunities_stage_changed ON ticketing_prod.opportunities(stage_changed_at);

-- 4. Create crm_tasks table
CREATE TABLE IF NOT EXISTS ticketing_prod.crm_tasks (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES ticketing_prod.customers(id) ON DELETE SET NULL,
  opportunity_id INTEGER REFERENCES ticketing_prod.opportunities(id) ON DELETE SET NULL,
  ticket_id INTEGER REFERENCES ticketing_prod.tickets(id) ON DELETE SET NULL,

  type VARCHAR(64) NOT NULL,      -- FOLLOW_UP, CHURN_WATCH, VIP_TICKET
  reason VARCHAR(64),             -- STALE_QUOTE, RISING_CHURN, HIGH_VALUE_CUSTOMER

  status VARCHAR(32) NOT NULL DEFAULT 'open',  -- open, done, dismissed
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  assigned_to_id TEXT REFERENCES ticketing_prod.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_customer ON ticketing_prod.crm_tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON ticketing_prod.crm_tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assignee ON ticketing_prod.crm_tasks(assigned_to_id);

-- 5. Create materialized view for opportunity stage metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS ticketing_prod.opportunity_stage_metrics AS
SELECT
  id,
  customer_id,
  title,
  stage,
  owner_id,
  estimated_value,
  created_at,
  stage_changed_at,
  EXTRACT(EPOCH FROM (NOW() - stage_changed_at)) / 86400::numeric AS days_in_stage,
  (stage = 'quote_sent' AND NOW() - stage_changed_at > INTERVAL '14 days') AS is_stale
FROM ticketing_prod.opportunities
WHERE closed_at IS NULL;  -- only open opportunities

CREATE INDEX IF NOT EXISTS idx_opportunity_stage_metrics_stale
  ON ticketing_prod.opportunity_stage_metrics(stage, is_stale, days_in_stage DESC);

CREATE INDEX IF NOT EXISTS idx_opportunity_stage_metrics_owner
  ON ticketing_prod.opportunity_stage_metrics(owner_id);

-- 6. Backfill stage_changed_at for existing opportunities
UPDATE ticketing_prod.opportunities
SET stage_changed_at = COALESCE(updated_at, created_at)
WHERE stage_changed_at IS NULL OR stage_changed_at = created_at;

COMMENT ON TABLE ticketing_prod.customer_scores IS 'RFM + health scoring for customer prioritization';
COMMENT ON TABLE ticketing_prod.crm_tasks IS 'Workflow tasks created by triggers (stale quotes, churn watch, VIP tickets)';
COMMENT ON MATERIALIZED VIEW ticketing_prod.opportunity_stage_metrics IS 'Pipeline health metrics - refresh with REFRESH MATERIALIZED VIEW';
