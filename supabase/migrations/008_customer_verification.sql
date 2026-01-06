-- Customer Verification Schema
-- Gates order-related support behind Shopify customer verification

-- Add verification columns to threads
alter table threads add column if not exists verified_at timestamptz;
alter table threads add column if not exists verification_status text; -- null, 'verified', 'flagged', 'pending'

-- Customer verifications table - tracks verification attempts and results
create table if not exists customer_verifications (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,

  -- Identifiers used for verification
  email text,
  order_number text,

  -- Shopify references (from successful lookups)
  shopify_customer_id text,
  shopify_order_id text,

  -- Verification result
  status text not null check (status in ('verified', 'flagged', 'not_found', 'mismatch', 'pending')),
  flags text[] default '{}',  -- e.g., ['chargeback', 'fraud']

  -- Cached customer details (for agent context)
  customer_name text,
  customer_email text,
  total_orders int,
  total_spent numeric(10, 2),

  created_at timestamptz default now()
);

-- Indexes for common lookups
create index if not exists idx_cv_thread on customer_verifications(thread_id);
create index if not exists idx_cv_email on customer_verifications(email);
create index if not exists idx_cv_order on customer_verifications(order_number);
create index if not exists idx_cv_status on customer_verifications(status);

-- Function to get latest verification for a thread
create or replace function get_thread_verification(p_thread_id uuid)
returns table (
  status text,
  flags text[],
  shopify_customer_id text,
  customer_name text,
  customer_email text,
  verified_at timestamptz
) language sql stable as $$
  select
    cv.status,
    cv.flags,
    cv.shopify_customer_id,
    cv.customer_name,
    cv.customer_email,
    cv.created_at as verified_at
  from customer_verifications cv
  where cv.thread_id = p_thread_id
    and cv.status = 'verified'
  order by cv.created_at desc
  limit 1;
$$;

-- Comment for documentation
comment on table customer_verifications is 'Tracks customer verification attempts for order-related support requests';
comment on column customer_verifications.status is 'verified=confirmed customer, flagged=has negative tags, not_found=order not in Shopify, mismatch=email doesnt match order, pending=awaiting info';
comment on column customer_verifications.flags is 'Negative flags found: chargeback, fraud, abusive, do_not_support, blocked';
