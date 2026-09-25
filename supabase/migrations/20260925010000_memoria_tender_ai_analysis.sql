-- Uložená AI analýza ponúk k zákazke (podklad pre board, bez odporúčania víťaza).
alter table public.memoria_tenders add column ai_analysis jsonb;
alter table public.memoria_tenders add column ai_analysis_at timestamptz;
alter table public.memoria_tenders add column ai_analysis_quotes text; -- odtlačok ponúk, z ktorých analýza vznikla
