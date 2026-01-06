-- HubSpot Email Insights
-- Stores imported emails and extracted insights for KB/instruction improvement

-- Raw imported emails from HubSpot
create table hubspot_emails (
  id uuid primary key default gen_random_uuid(),
  hubspot_id bigint unique not null,

  -- Email metadata
  email_type text not null, -- 'INCOMING_EMAIL', 'EMAIL'
  direction text not null, -- 'inbound', 'outbound'
  from_email text,
  to_emails text[], -- Array of recipients
  subject text,
  body_text text,

  -- Classification
  email_category text, -- 'customer_question', 'rob_instruction', 'support_response', 'other'
  topic text, -- Detected topic category

  -- HubSpot associations
  hubspot_contact_ids bigint[],

  -- Timestamps
  email_date timestamptz not null,
  imported_at timestamptz default now(),
  processed_at timestamptz
);

create index idx_hubspot_emails_category on hubspot_emails(email_category);
create index idx_hubspot_emails_topic on hubspot_emails(topic);
create index idx_hubspot_emails_date on hubspot_emails(email_date desc);
create index idx_hubspot_emails_from on hubspot_emails(from_email);

-- Extracted instructions from Rob's emails
create table extracted_instructions (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references hubspot_emails(id) on delete cascade,

  -- Instruction content
  instruction_text text not null,
  instruction_type text not null, -- 'policy', 'routing', 'escalation', 'kb_fact', 'approval', 'prohibition'

  -- Categorization
  applies_to text[], -- ['headlights', 'orders', 'refunds', etc.]
  keywords text[],

  -- Status
  status text default 'pending', -- 'pending', 'approved', 'rejected', 'implemented'
  implemented_in text, -- 'system_prompt', 'policy_rules', 'kb_doc', etc.

  -- Admin review
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,

  created_at timestamptz default now()
);

create index idx_instructions_type on extracted_instructions(instruction_type);
create index idx_instructions_status on extracted_instructions(status);

-- KB gap candidates (customer questions that may need KB articles)
create table kb_gap_candidates (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references hubspot_emails(id) on delete cascade,

  -- Question details
  question_text text not null,
  topic text not null,
  subtopic text,

  -- Analysis
  similar_kb_docs uuid[], -- IDs of potentially related KB docs
  similarity_score float, -- How well existing KB covers this
  gap_severity text, -- 'high', 'medium', 'low'

  -- Resolution
  status text default 'open', -- 'open', 'covered', 'needs_article', 'wont_cover'
  resolution_notes text,
  kb_doc_created uuid references kb_docs(id),

  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index idx_kb_gaps_topic on kb_gap_candidates(topic);
create index idx_kb_gaps_status on kb_gap_candidates(status);
create index idx_kb_gaps_severity on kb_gap_candidates(gap_severity);

-- Eval test cases generated from real Q&A pairs
create table eval_test_cases (
  id uuid primary key default gen_random_uuid(),

  -- Source emails
  question_email_id uuid references hubspot_emails(id),
  response_email_id uuid references hubspot_emails(id),

  -- Test case content
  customer_message text not null,
  expected_intent text,
  expected_response text,
  response_quality text, -- 'excellent', 'good', 'needs_improvement'

  -- Classification
  test_type text not null, -- 'intent_classification', 'response_quality', 'escalation_decision'
  topic text,

  -- Validation
  is_validated boolean default false,
  validated_by text,
  validated_at timestamptz,

  -- Usage tracking
  times_used int default 0,
  last_used_at timestamptz,

  created_at timestamptz default now()
);

create index idx_eval_cases_type on eval_test_cases(test_type);
create index idx_eval_cases_topic on eval_test_cases(topic);
create index idx_eval_cases_validated on eval_test_cases(is_validated);

-- Escalation patterns learned from Rob's feedback
create table escalation_patterns (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references hubspot_emails(id) on delete cascade,

  -- Pattern details
  pattern_type text not null, -- 'should_escalate', 'should_not_escalate', 'takeover'
  trigger_description text not null,

  -- Context
  original_escalation_reason text,
  rob_feedback text,

  -- Rule generation
  suggested_rule text,
  rule_implemented boolean default false,

  created_at timestamptz default now()
);

create index idx_escalation_patterns_type on escalation_patterns(pattern_type);

-- Import tracking
create table hubspot_import_runs (
  id uuid primary key default gen_random_uuid(),

  -- Run details
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text default 'running', -- 'running', 'completed', 'failed'

  -- Stats
  emails_fetched int default 0,
  emails_imported int default 0,
  instructions_extracted int default 0,
  kb_gaps_identified int default 0,
  eval_cases_created int default 0,

  -- Errors
  error_message text,

  -- Config
  date_from timestamptz,
  date_to timestamptz
);
