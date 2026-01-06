-- Draft Feedback Table
-- Stores human feedback on AI-generated drafts for training data

create table if not exists draft_feedback (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  event_id uuid references events(id) on delete set null,

  -- The draft that was rated
  draft_text text not null,
  intent text,

  -- Feedback
  rating text not null check (rating in ('approved', 'rejected', 'needs_edit')),
  feedback_notes text,
  edited_draft text, -- If agent edited the draft before sending

  -- Metadata
  created_by text, -- admin user identifier
  created_at timestamptz default now()
);

create index idx_df_thread on draft_feedback(thread_id);
create index idx_df_rating on draft_feedback(rating);
create index idx_df_intent on draft_feedback(intent);

comment on table draft_feedback is 'Human feedback on AI-generated drafts for training and evaluation';
