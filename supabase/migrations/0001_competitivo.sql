-- =====================================================================
-- Bosque de Vapor · fase competitiva (cuentas, amigos, grupos, partidas,
-- puntos, temporadas y clasificaciones).
-- Se pega entero en Supabase > SQL Editor y se pulsa "Run".
--
-- Regla de oro: el juego (el navegador) NUNCA escribe puntos, victorias,
-- nivel ni resultados finales. Solo puede llamar a las funciones de abajo,
-- que comprueban todo en el servidor.
-- =====================================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Utilidades: modos, registro de eventos y límite de peticiones
-- ---------------------------------------------------------------------
create or replace function public.mode_size(p_mode text) returns int
language sql immutable as $$
  select case p_mode when 'solo' then 1 when 'duo' then 2 when 'trio' then 3 when 'squad' then 4 end
$$;

create table if not exists public.security_events(
  id bigint generated always as identity primary key,
  user_id uuid,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists security_events_user on public.security_events(user_id, at desc);

create or replace function public.log_event(p_user uuid, p_kind text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.security_events(user_id, kind, detail) values (p_user, p_kind, coalesce(p_detail,'{}'::jsonb))
$$;

create table if not exists public.rate_events(
  user_id uuid not null,
  action text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_idx on public.rate_events(user_id, action, at desc);

-- Lanza un error si el usuario ha hecho la acción demasiadas veces en la ventana.
create or replace function public.hit_rate(p_action text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; u uuid := auth.uid();
begin
  if u is null then raise exception 'NO_SESION' using errcode = '28000'; end if;
  delete from rate_events where user_id = u and action = p_action and at < now() - p_window;
  select count(*) into n from rate_events where user_id = u and action = p_action;
  if n >= p_max then
    raise exception 'DEMASIADAS_PETICIONES' using errcode = 'P0001';
  end if;
  insert into rate_events(user_id, action) values (u, p_action);
end $$;

-- ---------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  avatar text not null default 'willie' check (avatar ~ '^[a-z]{2,16}$'),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  show_country boolean not null default false,
  visibility text not null default 'public' check (visibility in ('public','friends','private')),
  show_history boolean not null default true,
  level int not null default 1,
  xp int not null default 0,
  status text not null default 'offline' check (status in ('online','offline','playing')),
  last_seen timestamptz not null default now(),
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

-- Cada cuenta nueva (correo, Google, Apple, Discord) recibe un perfil con un
-- nombre provisional único. Una misma persona = un solo auth.users, aunque
-- vincule varios métodos de acceso (lo gestiona Supabase Auth).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare base text; cand text; i int := 0;
begin
  base := 'jugador_' || substr(replace(new.id::text,'-',''), 1, 6);
  cand := base;
  while exists (select 1 from profiles where username = cand) loop
    i := i + 1; cand := substr(base, 1, 13) || i::text;
  end loop;
  insert into profiles(id, username) values (new.id, cand) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Partida guardada en la nube (progreso del juego, no competitivo)
-- ---------------------------------------------------------------------
create table if not exists public.saves(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  check (octet_length(data::text) < 300000)
);

-- ---------------------------------------------------------------------
-- Amigos, bloqueos y denuncias
-- ---------------------------------------------------------------------
create table if not exists public.friendships(
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair on public.friendships(least(requester,addressee), greatest(requester,addressee));

create table if not exists public.blocks(
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists public.reports(
  id bigint generated always as identity primary key,
  reporter uuid not null references public.profiles(id) on delete cascade,
  reported uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('trampas','nombre','acoso','otro')),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now()
);

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from friendships where status='accepted'
    and least(requester,addressee)=least(a,b) and greatest(requester,addressee)=greatest(a,b))
$$;
create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from blocks where (blocker=a and blocked=b) or (blocker=b and blocked=a))
$$;
create or replace function public.can_see_profile(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select viewer = owner or exists(select 1 from profiles p where p.id = owner and not p.banned and (
    p.visibility = 'public' or (p.visibility = 'friends' and are_friends(viewer, owner))))
$$;

-- ---------------------------------------------------------------------
-- Grupos (salas) e invitaciones
-- ---------------------------------------------------------------------
create table if not exists public.parties(
  id uuid primary key default gen_random_uuid(),
  leader uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'duo' check (mode in ('solo','duo','trio','squad')),
  code text not null unique default upper(substr(md5(gen_random_uuid()::text),1,6)),
  room text check (room is null or room ~ '^bosquevapor8-[A-Z0-9]{4,8}$'),   -- sala de juego directa del líder
  match_id uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.party_members(
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade, -- un jugador, un grupo
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
create table if not exists public.party_invites(
  id bigint generated always as identity primary key,
  party_id uuid not null references public.parties(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (party_id, to_user)
);

create or replace function public.my_party() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select party_id from party_members where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Temporadas
-- ---------------------------------------------------------------------
create table if not exists public.seasons(
  id int primary key,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  closed boolean not null default false,
  check (ends_at > starts_at)
);
insert into public.seasons(id, name, starts_at, ends_at)
  values (1, 'Temporada 1', date_trunc('week', now()), date_trunc('week', now()) + interval '8 weeks')
  on conflict (id) do nothing;

create table if not exists public.season_rewards(
  season_id int not null references public.seasons(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null,
  division text not null,
  position int,
  coins int not null,
  claimed boolean not null default false,
  primary key (season_id, user_id, mode)
);

create or replace function public.division(p_points int) returns text
language sql immutable as $$
  select case when p_points >= 2000 then 'Leyenda' when p_points >= 1200 then 'Platino'
              when p_points >= 700 then 'Oro' when p_points >= 300 then 'Plata' else 'Bronce' end
$$;

-- ---------------------------------------------------------------------
-- Partidas, informes de cada jugador y resultados verificados
-- ---------------------------------------------------------------------
create table if not exists public.matches(
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('solo','duo','trio','squad')),
  status text not null default 'active' check (status in ('active','finished','rejected','abandoned')),
  season_id int not null references public.seasons(id),
  host uuid references public.profiles(id) on delete set null,
  difficulty text not null check (difficulty in ('a','s','n','x')),
  map text not null check (map ~ '^[a-z]{2,16}$'),
  seed int not null default floor(random()*2147483647)::int,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create table if not exists public.match_players(
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hero text not null default 'willie',
  active boolean not null default true,
  primary key (match_id, user_id)
);
-- Un jugador no puede estar en dos partidas en curso a la vez.
create unique index if not exists match_players_one_active on public.match_players(user_id) where active;

create table if not exists public.match_reports(
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  survived int not null,
  kills int not null,
  won boolean not null,
  level int not null,
  abandoned boolean not null default false,
  submitted_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create table if not exists public.match_results(
  match_id uuid primary key references public.matches(id) on delete cascade,
  survived int not null,
  kills int not null,
  won boolean not null,
  score int not null,
  flagged boolean not null default false,
  decided_at timestamptz not null default now()
);

create table if not exists public.ratings(
  season_id int not null references public.seasons(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null,
  points int not null default 0,
  wins int not null default 0,
  games int not null default 0,
  best int[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id, mode)
);
create table if not exists public.team_ratings(
  season_id int not null references public.seasons(id),
  mode text not null,
  team_key text not null,
  members uuid[] not null,
  points int not null default 0,
  wins int not null default 0,
  games int not null default 0,
  best int[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (season_id, mode, team_key)
);

-- Temporada en curso. Si la última ha terminado, la cierra (rangos y
-- recompensas) y abre la siguiente de 8 semanas.
create or replace function public.current_season() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare s record; nid int;
begin
  select * into s from seasons where now() >= starts_at and now() < ends_at order by id desc limit 1;
  if found then return s.id; end if;
  select * into s from seasons order by id desc limit 1;
  perform close_season(s.id);
  nid := s.id + 1;
  insert into seasons(id, name, starts_at, ends_at)
    values (nid, 'Temporada ' || nid, greatest(s.ends_at, date_trunc('week', now())), greatest(s.ends_at, date_trunc('week', now())) + interval '8 weeks')
    on conflict (id) do nothing;
  return nid;
end $$;

create or replace function public.close_season(p_season int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select closed from seasons where id = p_season) then return; end if;
  insert into season_rewards(season_id, user_id, mode, division, position, coins)
  select r.season_id, r.user_id, r.mode, division(r.points),
         rank() over (partition by r.mode order by r.points desc, r.wins desc)::int,
         case division(r.points) when 'Leyenda' then 1000 when 'Platino' then 600 when 'Oro' then 350 when 'Plata' then 200 else 100 end
  from ratings r where r.season_id = p_season and r.games > 0
  on conflict do nothing;
  update seasons set closed = true where id = p_season;
end $$;

-- Puntuación de una partida verificada (solo la calcula el servidor).
create or replace function public.match_score(p_survived int, p_won boolean, p_diff text) returns int
language sql immutable as $$
  select (round((least(p_survived, 1200) / 60.0 * 10 + case when p_won then 50 else 0 end)
         * case p_diff when 'n' then 1.3 when 'x' then 1.6 else 1 end))::int
$$;

-- Añade una puntuación a la lista de las 10 mejores y devuelve la nueva lista.
create or replace function public.top10(p_best int[], p_score int) returns int[]
language sql immutable as $$
  select coalesce(array_agg(v order by v desc), '{}') from (
    select v from unnest(array_append(p_best, p_score)) v order by v desc limit 10) t
$$;

-- Cierra una partida: comprueba los informes, decide el resultado y reparte puntos.
create or replace function public.finalize_match(p_match uuid, p_force boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m record; n_players int; n_reports int; need int; r_min int; r_max int; k_min int; k_max int;
        n_all int; all_won boolean; any_won boolean; flagged boolean := false; sc int; psc int; tk text; mem uuid[]; p record;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.status <> 'active' then return; end if;
  select count(*) into n_players from match_players where match_id = p_match;
  select count(*), min(survived), max(survived), min(kills), max(kills), bool_and(won), bool_or(won)
    into n_reports, r_min, r_max, k_min, k_max, all_won, any_won
    from match_reports where match_id = p_match and not abandoned;
  select count(*) into n_all from match_reports where match_id = p_match;
  need := ceil(n_players / 2.0);
  if n_all < n_players and not p_force then return; end if;  -- aún faltan informes
  update match_players set active = false where match_id = p_match;
  if n_reports < need or n_reports = 0 then
    update matches set status = 'abandoned', ended_at = now() where id = p_match;
    return;
  end if;
  -- Si los jugadores no coinciden, se toma el valor más bajo y se marca.
  if r_max > 0 and (r_max - r_min)::numeric / r_max > 0.15 then flagged := true; end if;
  if k_max > 0 and (k_max - k_min)::numeric / k_max > 0.25 then flagged := true; end if;
  if all_won is distinct from any_won then flagged := true; end if;
  if flagged then perform log_event(null, 'informes_distintos', jsonb_build_object('match', p_match)); end if;
  sc := case when m.difficulty = 'a' then 0 else match_score(r_min, coalesce(all_won,false), m.difficulty) end;
  insert into match_results(match_id, survived, kills, won, score, flagged)
    values (p_match, r_min, k_min, coalesce(all_won,false), sc, flagged);
  update matches set status = 'finished', ended_at = now() where id = p_match;
  if m.difficulty = 'a' then return; end if;  -- Aventura no cuenta para la clasificación
  -- Puntos individuales (también en modos de equipo) y experiencia de la cuenta.
  -- Quien abandona suma la partida jugada, pero sin puntos ni victoria.
  for p in select mp.user_id, coalesce(r.abandoned, true) as ab from match_players mp
           left join match_reports r on r.match_id = mp.match_id and r.user_id = mp.user_id
           where mp.match_id = p_match loop
    psc := case when p.ab then 0 else sc end;
    insert into ratings(season_id, user_id, mode, points, wins, games, best)
      values (m.season_id, p.user_id, m.mode, psc, case when all_won and not p.ab then 1 else 0 end, 1,
              case when p.ab then '{}'::int[] else array[sc] end)
    on conflict (season_id, user_id, mode) do update set
      best = case when p.ab then ratings.best else top10(ratings.best, sc) end,
      points = (select coalesce(sum(v),0) from unnest(case when p.ab then ratings.best else top10(ratings.best, sc) end) v),
      wins = ratings.wins + case when all_won and not p.ab then 1 else 0 end,
      games = ratings.games + 1, updated_at = now();
    update profiles set xp = xp + psc, level = 1 + floor(sqrt((xp + psc) / 50.0))::int where id = p.user_id;
  end loop;
  -- Puntos del equipo: el mismo grupo de personas es siempre el mismo equipo.
  if m.mode <> 'solo' then
    select array_agg(user_id order by user_id) into mem from match_players where match_id = p_match;
    tk := array_to_string(mem, ',');
    insert into team_ratings(season_id, mode, team_key, members, points, wins, games, best)
      values (m.season_id, m.mode, tk, mem, sc, case when all_won then 1 else 0 end, 1, array[sc])
    on conflict (season_id, mode, team_key) do update set
      best = top10(team_ratings.best, sc),
      points = (select coalesce(sum(v),0) from unnest(top10(team_ratings.best, sc)) v),
      wins = team_ratings.wins + case when all_won then 1 else 0 end,
      games = team_ratings.games + 1, updated_at = now();
  end if;
end $$;

-- Cierra las partidas que llevan demasiado tiempo abiertas.
create or replace function public.close_stale_matches() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare x record;
begin
  for x in select id from matches where status = 'active' and started_at < now() - interval '45 minutes' limit 50 loop
    perform finalize_match(x.id, true);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Funciones que llama el juego (todas comprueban quién eres)
-- ---------------------------------------------------------------------
create or replace function public.require_user() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'NO_SESION' using errcode = '28000'; end if;
  if exists(select 1 from profiles where id = u and banned) then raise exception 'CUENTA_BLOQUEADA'; end if;
  return u;
end $$;

-- Perfil
create or replace function public.update_profile(p_username text default null, p_avatar text default null,
  p_country text default null, p_show_country boolean default null, p_visibility text default null, p_show_history boolean default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  perform hit_rate('perfil', 20, interval '1 hour');
  if p_username is not null and (p_username !~ '^[A-Za-z0-9_]{3,16}$'
     or lower(p_username) ~ '(admin|moderador|soporte|support|oficial|bosquedevapor)') then
    raise exception 'NOMBRE_NO_VALIDO';
  end if;
  if p_avatar is not null and p_avatar !~ '^[a-z]{2,16}$' then raise exception 'AVATAR_NO_VALIDO'; end if;
  if p_country is not null and p_country <> '' and upper(p_country) !~ '^[A-Z]{2}$' then raise exception 'PAIS_NO_VALIDO'; end if;
  if p_visibility is not null and p_visibility not in ('public','friends','private') then raise exception 'PRIVACIDAD_NO_VALIDA'; end if;
  if p_username is not null and exists(select 1 from profiles where username = p_username::citext and id <> u) then
    raise exception 'NOMBRE_OCUPADO';
  end if;
  update profiles set
    username = coalesce(p_username, username),
    avatar = coalesce(p_avatar, avatar),
    country = case when p_country = '' then null else coalesce(upper(p_country), country) end,
    show_country = coalesce(p_show_country, show_country),
    visibility = coalesce(p_visibility, visibility),
    show_history = coalesce(p_show_history, show_history)
  where id = u;
end $$;

-- Guardado en la nube. p_base es la fecha del guardado del que partía este
-- dispositivo: si en la nube hay uno más nuevo (otro móvil), no se pisa y se
-- devuelve para que el jugador elija.
create or replace function public.save_progress(p_data jsonb, p_base timestamptz default null, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); cur saves;
begin
  perform hit_rate('guardar', 240, interval '1 hour');
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'GUARDADO_NO_VALIDO'; end if;
  if octet_length(p_data::text) >= 300000 then raise exception 'GUARDADO_DEMASIADO_GRANDE'; end if;
  select * into cur from saves where user_id = u for update;
  if found and not p_force and (p_base is null or cur.updated_at > p_base + interval '1 millisecond') then
    return jsonb_build_object('conflict', true, 'data', cur.data, 'updated_at', cur.updated_at);
  end if;
  insert into saves(user_id, data, updated_at) values (u, p_data, now())
    on conflict (user_id) do update set data = excluded.data, version = saves.version + 1, updated_at = now();
  return jsonb_build_object('conflict', false, 'updated_at', (select updated_at from saves where user_id = u));
end $$;

create or replace function public.load_progress() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  return (select jsonb_build_object('data', data, 'updated_at', updated_at) from saves where user_id = u);
end $$;

-- Mi propio perfil completo.
create or replace function public.get_me() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  update profiles set last_seen = now() where id = u;
  return (select to_jsonb(p) - 'banned' from profiles p where id = u);
end $$;

create or replace function public.set_status(p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  if p_status not in ('online','offline','playing') then raise exception 'ESTADO_NO_VALIDO'; end if;
  update profiles set status = p_status, last_seen = now() where id = u;
end $$;

-- Lo que otro jugador puede ver de un perfil, según su privacidad.
create or replace function public.get_profile(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); p profiles; s int; vis boolean;
begin
  select * into p from profiles where username = p_username::citext and not banned;
  if not found then return null; end if;
  if u is not null and is_blocked(u, p.id) then return null; end if;
  vis := can_see_profile(coalesce(u, '00000000-0000-0000-0000-000000000000'::uuid), p.id);
  s := current_season();
  return jsonb_build_object(
    'username', p.username, 'avatar', p.avatar, 'level', p.level,
    'visible', vis, 'me', u = p.id,
    'friend', case when u is null then null else are_friends(u, p.id) end,
    'country', case when vis and p.show_country then p.country end,
    'status', case when vis then (case when p.last_seen < now() - interval '3 minutes' then 'offline' else p.status end) end,
    'xp', case when vis then p.xp end,
    'stats', case when vis then (select coalesce(jsonb_object_agg(r.mode, jsonb_build_object(
        'points', r.points, 'wins', r.wins, 'games', r.games, 'division', division(r.points))), '{}'::jsonb)
        from ratings r where r.user_id = p.id and r.season_id = s) end,
    'totals', case when vis then (select jsonb_build_object('games', count(*),
        'wins', count(*) filter (where mr.won), 'losses', count(*) filter (where not mr.won))
        from match_players mp join match_results mr on mr.match_id = mp.match_id where mp.user_id = p.id) end);
end $$;

create or replace function public.get_history(p_username text, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); p profiles;
begin
  select * into p from profiles where username = p_username::citext;
  if not found then return '[]'::jsonb; end if;
  if not (u = p.id or (p.show_history and can_see_profile(coalesce(u,'00000000-0000-0000-0000-000000000000'::uuid), p.id))) then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(x order by x->>'date' desc) from (
    select jsonb_build_object('date', m.started_at, 'mode', m.mode, 'map', m.map, 'difficulty', m.difficulty,
      'hero', mp.hero, 'status', m.status, 'survived', mr.survived, 'kills', mr.kills, 'won', mr.won, 'score', mr.score) x
    from match_players mp join matches m on m.id = mp.match_id left join match_results mr on mr.match_id = m.id
    where mp.user_id = p.id order by m.started_at desc limit least(greatest(p_limit,1),50)) t), '[]'::jsonb);
end $$;

create or replace function public.search_players(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  if char_length(coalesce(p_query,'')) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('username', p.username, 'avatar', p.avatar, 'level', p.level,
      'friend', are_friends(u, p.id)))
    from (select * from profiles p where p.username ilike replace(replace(p_query,'%',''),'_','\_') || '%'
      and p.id <> u and not p.banned and not is_blocked(u, p.id) and p.visibility <> 'private'
      order by p.username limit 20) p), '[]'::jsonb);
end $$;

-- Amigos
create or replace function public.send_friend_request(p_username text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); t uuid; f friendships;
begin
  perform hit_rate('amistad', 30, interval '1 hour');
  select id into t from profiles where username = p_username::citext and not banned;
  if t is null then raise exception 'JUGADOR_NO_EXISTE'; end if;
  if t = u then raise exception 'ERES_TU'; end if;
  if is_blocked(u, t) then raise exception 'NO_PERMITIDO'; end if;
  select * into f from friendships where least(requester,addressee)=least(u,t) and greatest(requester,addressee)=greatest(u,t);
  if found then
    if f.status = 'accepted' then return 'ya_amigos'; end if;
    if f.addressee = u then update friendships set status='accepted' where id = f.id; return 'aceptada'; end if;
    return 'ya_enviada';
  end if;
  insert into friendships(requester, addressee) values (u, t);
  return 'enviada';
end $$;

create or replace function public.respond_friend_request(p_username text, p_accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); t uuid;
begin
  select id into t from profiles where username = p_username::citext;
  if p_accept then
    update friendships set status = 'accepted' where requester = t and addressee = u and status = 'pending';
  else
    delete from friendships where requester = t and addressee = u and status = 'pending';
  end if;
end $$;

create or replace function public.remove_friend(p_username text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); t uuid;
begin
  select id into t from profiles where username = p_username::citext;
  delete from friendships where least(requester,addressee)=least(u,t) and greatest(requester,addressee)=greatest(u,t);
end $$;

create or replace function public.list_friends() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'username', p.username, 'avatar', p.avatar, 'level', p.level,
      'state', case when f.status = 'accepted' then 'amigo' when f.requester = u then 'enviada' else 'recibida' end,
      'status', case when f.status <> 'accepted' then null when p.last_seen < now() - interval '3 minutes' then 'offline' else p.status end)
      order by p.username)
    from friendships f join profiles p on p.id = case when f.requester = u then f.addressee else f.requester end
    where u in (f.requester, f.addressee)), '[]'::jsonb);
end $$;

create or replace function public.block_user(p_username text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); t uuid;
begin
  select id into t from profiles where username = p_username::citext;
  if t is null or t = u then raise exception 'JUGADOR_NO_EXISTE'; end if;
  insert into blocks(blocker, blocked) values (u, t) on conflict do nothing;
  delete from friendships where least(requester,addressee)=least(u,t) and greatest(requester,addressee)=greatest(u,t);
  delete from party_invites where (from_user = u and to_user = t) or (from_user = t and to_user = u);
end $$;

create or replace function public.unblock_user(p_username text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  delete from blocks where blocker = u and blocked = (select id from profiles where username = p_username::citext);
end $$;

create or replace function public.report_user(p_username text, p_reason text, p_details text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); t uuid;
begin
  perform hit_rate('denuncia', 10, interval '1 day');
  select id into t from profiles where username = p_username::citext;
  if t is null or t = u then raise exception 'JUGADOR_NO_EXISTE'; end if;
  insert into reports(reporter, reported, reason, details) values (u, t, p_reason, left(p_details, 500));
  perform log_event(u, 'denuncia', jsonb_build_object('a', t, 'motivo', p_reason));
end $$;

-- Grupos
create or replace function public.create_party(p_mode text default 'duo') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); pid uuid;
begin
  perform hit_rate('grupo', 30, interval '1 hour');
  if mode_size(p_mode) is null then raise exception 'MODO_NO_VALIDO'; end if;
  perform leave_party();
  insert into parties(leader, mode) values (u, p_mode) returning id into pid;
  insert into party_members(party_id, user_id) values (pid, u);
  return get_party();
end $$;

create or replace function public.get_party() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); pt parties;
begin
  select pa.* into pt from parties pa join party_members pm on pm.party_id = pa.id where pm.user_id = u;
  if not found then return null; end if;
  return jsonb_build_object('id', pt.id, 'code', pt.code, 'mode', pt.mode, 'size', mode_size(pt.mode),
    'room', pt.room, 'match', case when exists(select 1 from matches m where m.id = pt.match_id and m.status = 'active') then pt.match_id end,
    'leader', (select username from profiles where id = pt.leader), 'me_leader', pt.leader = u,
    'members', (select jsonb_agg(jsonb_build_object('username', p.username, 'avatar', p.avatar, 'level', p.level,
        'ready', pm.ready, 'leader', p.id = pt.leader,
        'status', case when p.last_seen < now() - interval '3 minutes' then 'offline' else p.status end) order by pm.joined_at)
      from party_members pm join profiles p on p.id = pm.user_id where pm.party_id = pt.id));
end $$;

create or replace function public.set_party_mode(p_mode text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); n int;
begin
  if mode_size(p_mode) is null then raise exception 'MODO_NO_VALIDO'; end if;
  if not exists(select 1 from parties where id = my_party() and leader = u) then raise exception 'SOLO_EL_LIDER'; end if;
  select count(*) into n from party_members where party_id = my_party();
  if n > mode_size(p_mode) then raise exception 'DEMASIADOS_EN_EL_GRUPO'; end if;
  update parties set mode = p_mode where id = my_party();
  update party_members set ready = false where party_id = my_party();
  return get_party();
end $$;

create or replace function public.set_ready(p_ready boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  update party_members set ready = p_ready where user_id = u;
  return get_party();
end $$;

create or replace function public.invite_to_party(p_username text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); t uuid; pid uuid := my_party();
begin
  perform hit_rate('invitacion', 40, interval '1 hour');
  if pid is null then raise exception 'SIN_GRUPO'; end if;
  select id into t from profiles where username = p_username::citext and not banned;
  if t is null or t = u then raise exception 'JUGADOR_NO_EXISTE'; end if;
  if is_blocked(u, t) then raise exception 'NO_PERMITIDO'; end if;
  if not are_friends(u, t) then raise exception 'SOLO_AMIGOS'; end if;
  insert into party_invites(party_id, from_user, to_user) values (pid, u, t) on conflict do nothing;
end $$;

-- El líder anuncia la sala de juego directa para que el resto se conecte.
create or replace function public.set_party_room(p_room text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  if p_room is not null and p_room !~ '^bosquevapor8-[A-Z0-9]{4,8}$' then raise exception 'SALA_NO_VALIDA'; end if;
  update parties set room = p_room where id = my_party() and leader = u;
  if not found then raise exception 'SOLO_EL_LIDER'; end if;
  return get_party();
end $$;

create or replace function public.list_blocked() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  return coalesce((select jsonb_agg(p.username order by p.username) from blocks b join profiles p on p.id = b.blocked where b.blocker = u), '[]'::jsonb);
end $$;

create or replace function public.list_invites() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'from', p.username, 'mode', pa.mode, 'code', pa.code))
    from party_invites i join profiles p on p.id = i.from_user join parties pa on pa.id = i.party_id
    where i.to_user = u and i.created_at > now() - interval '1 hour'), '[]'::jsonb);
end $$;

create or replace function public.join_party(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); pt parties; n int;
begin
  perform hit_rate('unirse', 30, interval '1 hour');
  select * into pt from parties where code = upper(p_code) for update;
  if not found then raise exception 'GRUPO_NO_EXISTE'; end if;
  if exists(select 1 from party_members where party_id = pt.id and user_id = u) then return get_party(); end if;
  if is_blocked(u, pt.leader) then raise exception 'NO_PERMITIDO'; end if;
  select count(*) into n from party_members where party_id = pt.id;
  if n >= mode_size(pt.mode) then raise exception 'GRUPO_LLENO'; end if;
  perform leave_party();
  insert into party_members(party_id, user_id) values (pt.id, u);
  delete from party_invites where party_id = pt.id and to_user = u;
  return get_party();
end $$;

create or replace function public.leave_party() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); pid uuid := my_party(); nl uuid;
begin
  if pid is null then return; end if;
  delete from party_members where party_id = pid and user_id = u;
  if not exists(select 1 from party_members where party_id = pid) then
    delete from parties where id = pid;
  elsif (select leader from parties where id = pid) = u then
    select user_id into nl from party_members where party_id = pid order by joined_at limit 1;
    update parties set leader = nl, room = null where id = pid;
  end if;
end $$;

create or replace function public.kick_member(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  if not exists(select 1 from parties where id = my_party() and leader = u) then raise exception 'SOLO_EL_LIDER'; end if;
  delete from party_members where party_id = my_party() and user_id = (select id from profiles where username = p_username::citext) and user_id <> u;
  return get_party();
end $$;

-- Partidas
-- El líder empieza la partida. El servidor comprueba el modo, que estén todos
-- listos y que nadie esté ya en otra partida, y devuelve la semilla.
create or replace function public.start_match(p_difficulty text, p_map text, p_heroes jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); pt parties; n int; mid uuid; md text; sid int; mem uuid[];
begin
  perform hit_rate('partida', 40, interval '1 hour');
  perform close_stale_matches();
  if p_difficulty not in ('a','s','n','x') then raise exception 'DIFICULTAD_NO_VALIDA'; end if;
  if p_map is null or p_map not in ('forest','ruins','swamp') then raise exception 'MAPA_NO_VALIDO'; end if;
  sid := current_season();
  select pa.* into pt from parties pa join party_members pm on pm.party_id = pa.id where pm.user_id = u;
  if found then
    if pt.leader <> u then raise exception 'SOLO_EL_LIDER'; end if;
    md := pt.mode;
    select count(*) into n from party_members where party_id = pt.id;
    if n <> mode_size(md) then raise exception 'FALTAN_JUGADORES'; end if;
    if exists(select 1 from party_members where party_id = pt.id and user_id <> u and not ready) then
      raise exception 'NO_TODOS_LISTOS';
    end if;
  else
    md := 'solo';
  end if;
  mem := array(select user_id from party_members where party_id = pt.id union select u);
  if exists(select 1 from match_players where active and user_id = any(mem)) then
    raise exception 'YA_EN_PARTIDA';
  end if;
  insert into matches(mode, season_id, host, difficulty, map) values (md, sid, u, p_difficulty, p_map) returning id into mid;
  insert into match_players(match_id, user_id, hero)
    select mid, x, coalesce(nullif(p_heroes->>(select username::text from profiles where id = x), ''), 'willie')
    from unnest(mem) x;
  if pt.id is not null then
    update party_members set ready = false where party_id = pt.id;
    update parties set match_id = mid where id = pt.id;
  end if;
  perform log_event(u, 'partida_creada', jsonb_build_object('match', mid, 'modo', md));
  return jsonb_build_object('match', mid, 'mode', md, 'seed', (select seed from matches where id = mid), 'server_time', now());
end $$;

-- Cada jugador envía lo que vio al terminar. El servidor lo compara con la
-- hora real y con unos topes, y no deja enviarlo dos veces.
create or replace function public.submit_result(p_match uuid, p_survived int, p_kills int, p_won boolean, p_level int, p_abandoned boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); m matches; el numeric; res match_results;
begin
  perform hit_rate('resultado', 60, interval '1 hour');
  select * into m from matches where id = p_match;
  if not found or not exists(select 1 from match_players where match_id = p_match and user_id = u) then
    perform log_event(u, 'resultado_ajeno', jsonb_build_object('match', p_match));
    return jsonb_build_object('error', 'PARTIDA_NO_VALIDA');
  end if;
  if exists(select 1 from match_reports where match_id = p_match and user_id = u) then raise exception 'YA_ENVIADO'; end if;
  if m.status <> 'active' then raise exception 'PARTIDA_CERRADA'; end if;
  el := extract(epoch from now() - m.started_at);
  if p_survived is null or p_kills is null or p_level is null or p_won is null then raise exception 'DATOS_INCOMPLETOS'; end if;
  if p_survived < 0 or p_kills < 0 or p_level < 1 or p_level > 120
     or p_survived > el + 15
     or p_kills > (p_survived / 60.0 + 1) * 600 then
    perform log_event(u, 'resultado_imposible', jsonb_build_object('match', p_match, 'survived', p_survived,
      'kills', p_kills, 'level', p_level, 'elapsed', round(el)));
    return jsonb_build_object('error', 'RESULTADO_NO_VALIDO');
  end if;
  if p_kills > (p_survived / 60.0 + 1) * 300 then
    perform log_event(u, 'resultado_sospechoso', jsonb_build_object('match', p_match, 'kills', p_kills, 'survived', p_survived));
  end if;
  insert into match_reports(match_id, user_id, survived, kills, won, level, abandoned)
    values (p_match, u, p_survived, p_kills, p_won and not p_abandoned, p_level, p_abandoned);
  update match_players set active = false where match_id = p_match and user_id = u;
  perform finalize_match(p_match, false);
  select * into res from match_results where match_id = p_match;
  return jsonb_build_object('status', (select status from matches where id = p_match), 'score', res.score, 'flagged', res.flagged);
end $$;

-- Abandonar: cuenta como informe con lo jugado hasta ahora.
create or replace function public.abandon_match(p_match uuid, p_survived int, p_kills int, p_level int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return submit_result(p_match, p_survived, p_kills, false, p_level, true);
end $$;

-- ---------------------------------------------------------------------
-- Clasificaciones
-- ---------------------------------------------------------------------
create or replace function public.get_leaderboard(p_mode text, p_season int default null, p_country text default null,
  p_kind text default 'players', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s int := coalesce(p_season, current_season()); lim int := least(greatest(coalesce(p_limit,50),1),100);
begin
  if mode_size(p_mode) is null then raise exception 'MODO_NO_VALIDO'; end if;
  if p_kind = 'teams' then
    return coalesce((select jsonb_agg(x order by (x->>'pos')::int) from (
      select jsonb_build_object('pos', rank() over (order by t.points desc, t.wins desc, t.games),
        'name', (select string_agg(p.username::text, ' · ' order by p.username) from profiles p where p.id = any(t.members)),
        'level', (select round(avg(p.level)) from profiles p where p.id = any(t.members)),
        'points', t.points, 'wins', t.wins, 'games', t.games,
        'winrate', case when t.games > 0 then round(100.0 * t.wins / t.games) else 0 end,
        'division', division(t.points)) x
      from team_ratings t where t.season_id = s and t.mode = p_mode and t.games > 0
        and not exists(select 1 from profiles p where p.id = any(t.members) and p.banned)
      order by t.points desc, t.wins desc, t.games limit lim offset greatest(p_offset,0)) z), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(x order by (x->>'pos')::int) from (
    select jsonb_build_object('pos', rank() over (order by r.points desc, r.wins desc, r.games),
      'name', p.username, 'avatar', p.avatar, 'level', p.level, 'points', r.points, 'wins', r.wins, 'games', r.games,
      'winrate', case when r.games > 0 then round(100.0 * r.wins / r.games) else 0 end,
      'division', division(r.points), 'country', case when p.show_country then p.country end) x
    from ratings r join profiles p on p.id = r.user_id
    where r.season_id = s and r.mode = p_mode and r.games > 0 and not p.banned
      and (p_country is null or (p.show_country and p.country = upper(p_country)))
    order by r.points desc, r.wins desc, r.games limit lim offset greatest(p_offset,0)) z), '[]'::jsonb);
end $$;

create or replace function public.get_my_rank(p_mode text, p_season int default null, p_country text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); s int := coalesce(p_season, current_season()); r ratings; pos int;
begin
  if u is null then return null; end if;
  select * into r from ratings where season_id = s and user_id = u and mode = p_mode;
  if not found or r.games = 0 then return null; end if;
  select 1 + count(*) into pos from ratings x join profiles p on p.id = x.user_id
    where x.season_id = s and x.mode = p_mode and x.games > 0 and not p.banned
      and (p_country is null or (p.show_country and p.country = upper(p_country)))
      and (x.points > r.points or (x.points = r.points and x.wins > r.wins) or (x.points = r.points and x.wins = r.wins and x.games < r.games));
  return jsonb_build_object('pos', pos, 'points', r.points, 'wins', r.wins, 'games', r.games,
    'winrate', round(100.0 * r.wins / r.games), 'division', division(r.points));
end $$;

create or replace function public.list_seasons() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform current_season();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'starts', starts_at, 'ends', ends_at,
    'current', now() >= starts_at and now() < ends_at) order by id desc), '[]'::jsonb) from seasons);
end $$;

create or replace function public.claim_season_rewards() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user(); c int;
begin
  perform current_season();
  select coalesce(sum(coins),0) into c from season_rewards where user_id = u and not claimed;
  update season_rewards set claimed = true where user_id = u and not claimed;
  return jsonb_build_object('coins', c);
end $$;

-- ---------------------------------------------------------------------
-- Datos personales: descargar y borrar la cuenta
-- ---------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := require_user();
begin
  return jsonb_build_object(
    'perfil', (select to_jsonb(p) - 'banned' from profiles p where id = u),
    'guardado', (select data from saves where user_id = u),
    'amigos', list_friends(),
    'bloqueados', (select coalesce(jsonb_agg(p.username), '[]'::jsonb) from blocks b join profiles p on p.id = b.blocked where b.blocker = u),
    'partidas', get_history((select username::text from profiles where id = u), 50),
    'puntos', (select coalesce(jsonb_agg(to_jsonb(r) - 'user_id'), '[]'::jsonb) from ratings r where r.user_id = u));
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare u uuid := require_user();
begin
  perform leave_party();
  -- Los equipos que lo incluían dejan de aparecer en la clasificación.
  delete from team_ratings where u = any(members);
  delete from auth.users where id = u;   -- borra en cascada perfil, guardado, amigos, puntos...
end $$;

-- ---------------------------------------------------------------------
-- Permisos: por defecto nadie puede tocar nada; luego se abre lo justo.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.saves enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.party_invites enable row level security;
alter table public.seasons enable row level security;
alter table public.season_rewards enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_reports enable row level security;
alter table public.match_results enable row level security;
alter table public.ratings enable row level security;
alter table public.team_ratings enable row level security;
alter table public.security_events enable row level security;
alter table public.rate_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Lectura directa (solo lo propio o lo público). Para el tiempo real.
-- De los perfiles ajenos solo se puede leer lo público; lo demás va por get_me().
grant select (id, username, avatar, level, status, last_seen) on public.profiles to authenticated;
grant select on public.saves, public.parties, public.party_members, public.party_invites,
  public.seasons, public.matches, public.match_players, public.match_results, public.friendships to authenticated;
grant select on public.seasons to anon;

drop policy if exists perfiles_ver on public.profiles;
create policy perfiles_ver on public.profiles for select to authenticated using (can_see_profile(auth.uid(), id));
drop policy if exists guardado_ver on public.saves;
create policy guardado_ver on public.saves for select to authenticated using (user_id = auth.uid());
drop policy if exists amistades_ver on public.friendships;
create policy amistades_ver on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
drop policy if exists grupos_ver on public.parties;
create policy grupos_ver on public.parties for select to authenticated using (id = my_party());
drop policy if exists miembros_ver on public.party_members;
create policy miembros_ver on public.party_members for select to authenticated using (party_id = my_party());
drop policy if exists invitaciones_ver on public.party_invites;
create policy invitaciones_ver on public.party_invites for select to authenticated using (auth.uid() in (from_user, to_user));
drop policy if exists temporadas_ver on public.seasons;
create policy temporadas_ver on public.seasons for select to anon, authenticated using (true);
drop policy if exists partidas_ver on public.matches;
create policy partidas_ver on public.matches for select to authenticated
  using (exists(select 1 from match_players mp where mp.match_id = id and mp.user_id = auth.uid()));
drop policy if exists jugadores_ver on public.match_players;
create policy jugadores_ver on public.match_players for select to authenticated using (user_id = auth.uid());
drop policy if exists resultados_ver on public.match_results;
create policy resultados_ver on public.match_results for select to authenticated
  using (exists(select 1 from match_players mp where mp.match_id = match_results.match_id and mp.user_id = auth.uid()));

-- El guardado del juego sí lo escribe el jugador (es su progreso, no puntos).
grant insert, update on public.saves to authenticated;
drop policy if exists guardado_crear on public.saves;
create policy guardado_crear on public.saves for insert to authenticated with check (user_id = auth.uid());
drop policy if exists guardado_cambiar on public.saves;
create policy guardado_cambiar on public.saves for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Funciones que puede llamar el juego.
grant execute on function
  public.update_profile(text,text,text,boolean,text,boolean), public.set_status(text), public.get_me(),
  public.save_progress(jsonb,timestamptz,boolean), public.load_progress(),
  public.get_profile(text), public.get_history(text,int), public.search_players(text),
  public.send_friend_request(text), public.respond_friend_request(text,boolean), public.remove_friend(text),
  public.list_friends(), public.block_user(text), public.unblock_user(text), public.report_user(text,text,text),
  public.create_party(text), public.get_party(), public.set_party_mode(text), public.set_ready(boolean),
  public.invite_to_party(text), public.list_invites(), public.set_party_room(text), public.list_blocked(), public.join_party(text), public.leave_party(),
  public.kick_member(text), public.start_match(text,text,jsonb), public.submit_result(uuid,int,int,boolean,int,boolean),
  public.abandon_match(uuid,int,int,int), public.get_my_rank(text,int,text), public.claim_season_rewards(),
  public.export_my_data(), public.delete_my_account()
  to authenticated;
grant execute on function public.get_leaderboard(text,int,text,text,int,int), public.list_seasons(),
  public.get_profile(text), public.get_history(text,int)
  to anon, authenticated;
-- Las funciones internas que usan las políticas también necesitan permiso de ejecución.
grant execute on function public.can_see_profile(uuid,uuid), public.are_friends(uuid,uuid), public.my_party()
  to authenticated;

-- Tiempo real: avisar al juego cuando cambian el grupo, sus miembros o las invitaciones.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.parties; exception when others then null; end;
    begin alter publication supabase_realtime add table public.party_members; exception when others then null; end;
    begin alter publication supabase_realtime add table public.party_invites; exception when others then null; end;
    begin alter publication supabase_realtime add table public.friendships; exception when others then null; end;
  end if;
end $$;
