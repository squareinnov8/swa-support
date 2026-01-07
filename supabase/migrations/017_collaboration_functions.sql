-- Collaboration Helper Functions
-- Additional functions to support human-agent collaboration

-- Function to append a Gmail label to a thread's gmail_labels array
create or replace function append_gmail_label(p_thread_id uuid, p_label text)
returns void language plpgsql as $$
begin
  update threads
  set gmail_labels = array_append(coalesce(gmail_labels, ARRAY[]::text[]), p_label),
      updated_at = now()
  where id = p_thread_id
    and (gmail_labels is null or not (gmail_labels @> ARRAY[p_label]));
end;
$$;

-- Function to remove a Gmail label from a thread
create or replace function remove_gmail_label(p_thread_id uuid, p_label text)
returns void language plpgsql as $$
begin
  update threads
  set gmail_labels = array_remove(gmail_labels, p_label),
      updated_at = now()
  where id = p_thread_id;
end;
$$;

-- Comments
comment on function append_gmail_label is 'Add a Gmail label to a thread if not already present';
comment on function remove_gmail_label is 'Remove a Gmail label from a thread';
