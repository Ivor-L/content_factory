-- Keep task_summaries in sync with creative_tasks for text2image posters
create or replace function public.sync_text2image_poster_summary()
returns trigger
language plpgsql
as $$
declare
  poster_mode text;
  text2image_meta jsonb;
  summary_metadata jsonb;
  preview_text text;
  first_image_url text;
begin
  poster_mode := coalesce(NEW.metadata->'custom'->>'posterMode', '');
  if poster_mode <> 'text2image' then
    return NEW;
  end if;

  text2image_meta := coalesce(NEW.metadata->'custom'->'text2image', '{}'::jsonb);

  summary_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'posterMode', 'text2image',
      'styleId', text2image_meta->>'styleId',
      'styleName', text2image_meta->>'styleName',
      'imageCount', nullif(text2image_meta->>'imageCount', '')::int,
      'workflowId', text2image_meta->>'workflowId',
      'workflowName', text2image_meta->>'workflowName'
    )
  );

  preview_text := nullif(left(coalesce(NEW.idea_text, NEW.title, ''), 140), '');
  first_image_url := nullif(NEW.generated_images_json->0->>'url', '');

  insert into public.task_summaries (
    id,
    user_id,
    task_type,
    task_id,
    title,
    status,
    preview,
    thumbnail_url,
    progress,
    metadata
  ) values (
    gen_random_uuid(),
    NEW.user_id,
    'poster',
    NEW.id,
    coalesce(NEW.title, '小红书图文'),
    coalesce(NEW.status, 'PROCESSING'),
    preview_text,
    first_image_url,
    NEW.progress,
    summary_metadata
  )
  on conflict (task_type, task_id)
  do update set
    status = coalesce(EXCLUDED.status, task_summaries.status),
    preview = coalesce(EXCLUDED.preview, task_summaries.preview),
    thumbnail_url = coalesce(EXCLUDED.thumbnail_url, task_summaries.thumbnail_url),
    progress = coalesce(EXCLUDED.progress, task_summaries.progress),
    metadata = coalesce(task_summaries.metadata, '{}'::jsonb) || coalesce(EXCLUDED.metadata, '{}'::jsonb),
    updated_at = now();

  return NEW;
end;
$$;

drop trigger if exists trg_sync_text2image_poster_summary on public.creative_tasks;

create trigger trg_sync_text2image_poster_summary
after update on public.creative_tasks
for each row
execute function public.sync_text2image_poster_summary();
