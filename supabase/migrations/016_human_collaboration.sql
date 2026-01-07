-- Human-Agent Collaboration Schema
-- Enables observation mode, learning proposals, and escalation email tracking

-- Intervention observations - what Lina learns during human handling
create table if not exists intervention_observations (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,

  -- Intervention timing
  intervention_start timestamptz not null,
  intervention_end timestamptz,

  -- Who handled it and how
  human_handler text not null,         -- e.g., 'rob@squarewheelsauto.com'
  intervention_channel text not null,  -- 'email', 'hubspot', 'admin_ui'

  -- Observations during handling
  observed_messages jsonb default '[]', -- Messages exchanged during intervention
  questions_asked text[],               -- Questions human asked customer
  troubleshooting_steps text[],         -- Steps taken to resolve
  resolution_approach text,             -- High-level approach used
  new_information_discovered text[],    -- Info not in KB or instructions

  -- Resolution
  resolution_type text,                 -- 'resolved', 'escalated_further', 'transferred'
  resolution_summary text,              -- Human description of resolution

  -- Learning
  learning_summary text,                -- AI-generated learnings from observation

  created_at timestamptz default now()
);

create index idx_intervention_observations_thread on intervention_observations(thread_id);
create index idx_intervention_observations_handler on intervention_observations(human_handler);
create index idx_intervention_observations_active on intervention_observations(intervention_end)
  where intervention_end is null;

-- Learning proposals - KB + instruction updates for approval
create table if not exists learning_proposals (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  intervention_id uuid references intervention_observations(id) on delete cascade,

  -- Proposal details
  proposal_type text not null,          -- 'kb_article', 'instruction_update'
  title text not null,
  summary text not null,                -- Brief description of what was learned
  proposed_content text not null,       -- The actual KB article or instruction text

  -- Context
  source_context jsonb,                 -- Thread excerpts, etc. (sanitized)

  -- Approval workflow
  status text default 'pending',        -- 'pending', 'approved', 'rejected', 'published'
  review_notes text,                    -- Notes from reviewer
  reviewed_by text,                     -- Who approved/rejected
  reviewed_at timestamptz,

  -- If published
  published_kb_doc_id uuid references kb_docs(id),
  published_instruction_id uuid,        -- Reference to agent_instructions.id if instruction

  created_at timestamptz default now()
);

create index idx_learning_proposals_status on learning_proposals(status);
create index idx_learning_proposals_type on learning_proposals(proposal_type);
create index idx_learning_proposals_intervention on learning_proposals(intervention_id);

-- Escalation emails - track rich escalation emails sent to Rob
create table if not exists escalation_emails (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,

  -- Email details
  sent_to text not null,                -- e.g., 'rob@squarewheelsauto.com'
  subject text not null,
  html_body text not null,

  -- Customer profile included
  customer_profile jsonb,               -- Snapshot of customer data at time of escalation

  -- Tracking
  sent_at timestamptz default now(),
  gmail_message_id text,                -- Gmail message ID for tracking replies

  -- Response handling
  response_received boolean default false,
  response_type text,                   -- 'instruction', 'resolve', 'draft', 'takeover'
  response_content text,
  response_at timestamptz,

  created_at timestamptz default now()
);

create index idx_escalation_emails_thread on escalation_emails(thread_id);
create index idx_escalation_emails_gmail on escalation_emails(gmail_message_id)
  where gmail_message_id is not null;
create index idx_escalation_emails_pending on escalation_emails(response_received)
  where response_received = false;

-- Add human handling columns to threads
alter table threads add column if not exists human_handling_mode boolean default false;
alter table threads add column if not exists human_handler text;
alter table threads add column if not exists human_handling_started_at timestamptz;
alter table threads add column if not exists gmail_labels text[];

-- Add index for finding threads in human handling mode
create index if not exists idx_threads_human_handling on threads(human_handling_mode)
  where human_handling_mode = true;

-- Add rob@ sync state for monitoring his inbox
insert into gmail_sync_state (email_address, sync_enabled)
values ('rob@squarewheelsauto.com', false)
on conflict (email_address) do nothing;

-- Comments
comment on table intervention_observations is 'Records what Lina observes during human handling for learning';
comment on table learning_proposals is 'KB articles and instruction updates proposed from observations, pending approval';
comment on table escalation_emails is 'Rich escalation emails sent to Rob with customer profiles';
comment on column threads.human_handling_mode is 'True when a human has taken over handling this thread';
comment on column threads.human_handler is 'Email of the human currently handling this thread';
comment on column threads.gmail_labels is 'Gmail labels applied to this thread (e.g., support-intervention)';
