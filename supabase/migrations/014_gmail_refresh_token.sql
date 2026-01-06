-- Add refresh token column to gmail_sync_state
alter table gmail_sync_state add column if not exists refresh_token text;

-- Function to increment error count
create or replace function increment_gmail_error_count(p_email text, p_error text)
returns void language plpgsql as $$
begin
  update gmail_sync_state
  set error_count = error_count + 1,
      last_error = p_error,
      updated_at = now()
  where email_address = p_email;
end;
$$;
