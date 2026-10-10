create extension if not exists pgcrypto;

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null unique,
  hypothesis text not null,
  change_description text not null,
  target_metric text not null,
  expected_direction text not null check (expected_direction in ('increase','decrease','maintain')),
  observation_window interval not null default interval '7 days',
  decision_rule text not null,
  status text not null default 'planned' check (status in ('planned','running','completed','paused','rejected')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create table if not exists public.loop_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('VISIT','ACTIVATION','TRIAL_STARTED','PURCHASE','RETENTION','DIAGNOSTIC_STARTED','OFFER_INTENT')),
  occurred_at timestamptz not null,
  anonymous_id text,
  experiment_id uuid references public.experiments(id) on delete set null,
  idempotency_key text not null unique,
  source text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(properties) = 'object')
);

create index if not exists loop_events_name_time_idx on public.loop_events (event_name, occurred_at desc);
create index if not exists loop_events_experiment_time_idx on public.loop_events (experiment_id, occurred_at desc);
create index if not exists loop_events_anon_time_idx on public.loop_events (anonymous_id, occurred_at desc);

create table if not exists public.revenue_evidence (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_object_id text not null,
  mode text not null check (mode in ('test','live')),
  offer_id text not null,
  currency text not null check (currency = upper(currency) and length(currency) = 3),
  amount_minor bigint not null check (amount_minor >= 0),
  payment_status text not null check (payment_status in ('pending','succeeded','failed','refunded','disputed')),
  occurred_at timestamptz,
  verified_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  unique (provider, provider_object_id),
  check (jsonb_typeof(evidence) = 'object')
);

create index if not exists revenue_evidence_status_time_idx on public.revenue_evidence (payment_status, occurred_at desc);
create index if not exists revenue_evidence_mode_time_idx on public.revenue_evidence (mode, occurred_at desc);

create table if not exists public.loop_decisions (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid references public.experiments(id) on delete set null,
  decision text not null check (decision in ('continue','iterate','stop','inconclusive')),
  rationale text not null,
  evidence_summary jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now(),
  next_action text not null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(evidence_summary) = 'object')
);

create index if not exists loop_decisions_time_idx on public.loop_decisions (decided_at desc);
create index if not exists loop_decisions_experiment_id_idx on public.loop_decisions (experiment_id);

alter table public.experiments enable row level security;
alter table public.loop_events enable row level security;
alter table public.revenue_evidence enable row level security;
alter table public.loop_decisions enable row level security;

revoke all on table public.experiments from anon, authenticated;
revoke all on table public.loop_events from anon, authenticated;
revoke all on table public.revenue_evidence from anon, authenticated;
revoke all on table public.loop_decisions from anon, authenticated;

comment on table public.experiments is 'Hypotheses and controlled product/business experiments for the revenue improvement loop.';
comment on table public.loop_events is 'Minimal behavioral event ledger; never treat UI intent as confirmed revenue.';
comment on table public.revenue_evidence is 'Provider-backed payment evidence; test mode is never production revenue.';
comment on table public.loop_decisions is 'Evidence-linked decisions that close each improvement loop.';
