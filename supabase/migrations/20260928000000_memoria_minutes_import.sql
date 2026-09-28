-- Memoria — import zápisnice (26/28. 9. 2026).
--
-- AI prečíta zápisnicu a navrhne body, rozhodnutia a úlohy; board ich v aplikácii skontroluje
-- a potvrdí. Potvrdené údaje zapíše táto funkcia naraz v jednej transakcii: buď sa uloží
-- všetko, alebo nič. Beží s právami prihláseného používateľa (SECURITY INVOKER), takže
-- platia rovnaké pravidlá RLS ako pri ručnom zápise – zapisovať môže iba board.
--
-- Vstup (jsonb):
-- {
--   "meeting_id": uuid | null,          -- existujúce zasadnutie (inak sa založí nové)
--   "meeting": { title, body, meeting_on, meeting_time, location, convened_by, attendees, quorum_reached, notes },
--   "is_demo": bool,
--   "items":   [{ title, item_type, outcome, decision: { title, decision, rationale, context,
--                 votes_for, votes_against, votes_abstain } | null, links: [{ entity_type, entity_id }] }],
--   "tasks":   [{ item_index, title, description, executor_role, executor_name, supervisor_name,
--                 due_date, priority, tender_id, contract_id }],
--   "task_updates": [{ task_id, note, new_status }],
--   "document": { title, storage_path, document_date } | null
-- }

create or replace function public.memoria_import_minutes(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meeting_id uuid := nullif(p->>'meeting_id', '')::uuid;
  v_meeting record;
  v_is_demo boolean := coalesce((p->>'is_demo')::boolean, false);
  m jsonb := coalesce(p->'meeting', '{}'::jsonb);
  it jsonb;
  tk jsonb;
  tu jsonb;
  lk jsonb;
  d jsonb;
  v_pos integer;
  v_idx integer := 0;
  v_item_id uuid;
  v_dec_id uuid;
  v_dec_ids uuid[] := '{}';
  v_task_id uuid;
  v_status text;
  n_items integer := 0;
  n_decisions integer := 0;
  n_tasks integer := 0;
  n_updates integer := 0;
begin
  if not public.is_approved_board_member() then
    raise exception 'Only the board can import minutes';
  end if;

  -- 1. Zasadnutie: doplniť existujúce alebo založiť nové.
  if v_meeting_id is null then
    insert into public.memoria_meetings (title, body, meeting_on, meeting_time, location, convened_by, status, attendees, quorum_reached, notes, is_demo)
    values (
      coalesce(nullif(m->>'title', ''), 'Meeting'),
      coalesce(nullif(m->>'body', ''), 'board'),
      (m->>'meeting_on')::date,
      nullif(m->>'meeting_time', ''),
      nullif(m->>'location', ''),
      nullif(m->>'convened_by', ''),
      'held',
      nullif(m->>'attendees', ''),
      case when m ? 'quorum_reached' and m->>'quorum_reached' is not null then (m->>'quorum_reached')::boolean end,
      nullif(m->>'notes', ''),
      v_is_demo
    )
    returning id into v_meeting_id;
  else
    update public.memoria_meetings set
      status = 'held',
      meeting_time = coalesce(nullif(m->>'meeting_time', ''), meeting_time),
      location = coalesce(nullif(m->>'location', ''), location),
      convened_by = coalesce(nullif(m->>'convened_by', ''), convened_by),
      attendees = coalesce(nullif(m->>'attendees', ''), attendees),
      quorum_reached = case when m ? 'quorum_reached' and m->>'quorum_reached' is not null then (m->>'quorum_reached')::boolean else quorum_reached end,
      notes = coalesce(nullif(m->>'notes', ''), notes)
    where id = v_meeting_id;
    if not found then
      raise exception 'Meeting not found';
    end if;
  end if;

  select * into v_meeting from public.memoria_meetings where id = v_meeting_id;
  select coalesce(max(position), 0) into v_pos from public.memoria_meeting_items where meeting_id = v_meeting_id;

  -- 2. Body programu a rozhodnutia.
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_dec_id := null;
    d := it->'decision';
    if d is not null and jsonb_typeof(d) = 'object' and nullif(d->>'decision', '') is not null then
      insert into public.memoria_decisions (title, decided_on, body, authority_basis, context, decision, rationale, votes_for, votes_against, votes_abstain, status, is_demo)
      values (
        coalesce(nullif(d->>'title', ''), it->>'title'),
        v_meeting.meeting_on,
        case when v_meeting.body = 'board' then 'board' else 'general_meeting' end,
        case when v_meeting.body = 'board' then 'Estatutos art. XXII' else 'Estatutos art. XX–XXI; LPH art. 17' end,
        nullif(d->>'context', ''),
        d->>'decision',
        nullif(d->>'rationale', ''),
        nullif(d->>'votes_for', '')::integer,
        nullif(d->>'votes_against', '')::integer,
        nullif(d->>'votes_abstain', '')::integer,
        'active',
        v_is_demo
      )
      returning id into v_dec_id;
      n_decisions := n_decisions + 1;

      insert into public.memoria_decision_links (decision_id, entity_type, entity_id, is_demo)
      values (v_dec_id, 'meeting', v_meeting_id, v_is_demo);
      for lk in select * from jsonb_array_elements(coalesce(it->'links', '[]'::jsonb)) loop
        if nullif(lk->>'entity_id', '') is not null then
          insert into public.memoria_decision_links (decision_id, entity_type, entity_id, is_demo)
          values (v_dec_id, lk->>'entity_type', (lk->>'entity_id')::uuid, v_is_demo);
        end if;
      end loop;
    end if;

    v_pos := v_pos + 1;
    insert into public.memoria_meeting_items (meeting_id, position, title, item_type, source_type, outcome, decision_id, is_demo)
    values (
      v_meeting_id,
      v_pos,
      coalesce(nullif(it->>'title', ''), '—'),
      coalesce(nullif(it->>'item_type', ''), case when v_dec_id is null then 'information' else 'decision' end),
      'manual',
      nullif(it->>'outcome', ''),
      v_dec_id,
      v_is_demo
    )
    returning id into v_item_id;
    n_items := n_items + 1;
    v_dec_ids := array_append(v_dec_ids, v_dec_id);
    v_idx := v_idx + 1;
  end loop;

  -- 3. Úlohy (s väzbou na rozhodnutie bodu, z ktorého vyplývajú).
  for tk in select * from jsonb_array_elements(coalesce(p->'tasks', '[]'::jsonb)) loop
    insert into public.memoria_tasks (title, description, decision_id, executor_role, executor_name, supervisor_name, due_date, priority, status, tender_id, contract_id, is_demo)
    values (
      tk->>'title',
      nullif(tk->>'description', ''),
      case
        when nullif(tk->>'item_index', '') is not null
             and (tk->>'item_index')::integer between 0 and coalesce(array_length(v_dec_ids, 1), 0) - 1
        then v_dec_ids[(tk->>'item_index')::integer + 1]
      end,
      coalesce(nullif(tk->>'executor_role', ''), 'administrator'),
      nullif(tk->>'executor_name', ''),
      nullif(tk->>'supervisor_name', ''),
      nullif(tk->>'due_date', '')::date,
      coalesce(nullif(tk->>'priority', ''), 'normal'),
      'not_started',
      nullif(tk->>'tender_id', '')::uuid,
      nullif(tk->>'contract_id', '')::uuid,
      v_is_demo
    )
    returning id into v_task_id;
    n_tasks := n_tasks + 1;
  end loop;

  -- 4. Stav úloh z predchádzajúcich zasadnutí, o ktorých zápisnica hovorí.
  for tu in select * from jsonb_array_elements(coalesce(p->'task_updates', '[]'::jsonb)) loop
    v_status := nullif(tu->>'new_status', '');
    insert into public.memoria_task_updates (task_id, note, new_status, is_demo)
    select t.id, coalesce(nullif(tu->>'note', ''), '—'), v_status, t.is_demo
    from public.memoria_tasks t where t.id = (tu->>'task_id')::uuid;
    if v_status is not null then
      update public.memoria_tasks set
        status = v_status,
        blocked_reason = case when v_status = 'blocked' then coalesce(nullif(tu->>'note', ''), blocked_reason, '—') else null end,
        completed_on = case when v_status = 'done' then v_meeting.meeting_on else null end
      where id = (tu->>'task_id')::uuid;
    end if;
    n_updates := n_updates + 1;
  end loop;

  -- 5. Zápisnica ako príloha zasadnutia.
  if p->'document' is not null and nullif(p->'document'->>'storage_path', '') is not null then
    insert into public.memoria_documents (title, doc_type, storage_path, document_date, entity_type, entity_id, is_demo)
    values (
      coalesce(nullif(p->'document'->>'title', ''), 'Minutes'),
      'minutes',
      p->'document'->>'storage_path',
      coalesce(nullif(p->'document'->>'document_date', '')::date, v_meeting.meeting_on),
      'meeting',
      v_meeting_id,
      v_is_demo
    );
  end if;

  return jsonb_build_object(
    'meeting_id', v_meeting_id,
    'items', n_items,
    'decisions', n_decisions,
    'tasks', n_tasks,
    'task_updates', n_updates
  );
end;
$$;

revoke all on function public.memoria_import_minutes(jsonb) from public, anon;
grant execute on function public.memoria_import_minutes(jsonb) to authenticated;
