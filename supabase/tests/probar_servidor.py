#!/usr/bin/env python3
"""Pruebas de seguridad y de reglas del servidor de Bosque de Vapor.

Se ejecutan contra un Postgres local que imita Supabase (00_emular_supabase.sql)
con la migración 0001_competitivo.sql aplicada. Cada prueba actúa como un
jugador real (rol "authenticated" con su identificador), igual que haría el
juego a través de Supabase, e intenta tanto lo permitido como las trampas.

Uso: python3 supabase/tests/probar_servidor.py "host=/tmp/pg port=5433 dbname=bdv user=postgres"
"""
import json, sys, uuid
import psycopg2

DSN = sys.argv[1] if len(sys.argv) > 1 else "host=/tmp/pg port=5433 dbname=bdv user=postgres"
db = psycopg2.connect(DSN)
db.autocommit = True
ok = fail = 0


def check(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
        print("  ok   ", name)
    else:
        fail += 1
        print("  FALLO", name, extra)


def admin(sql, *a):
    with db.cursor() as c:
        c.execute("reset role; select set_config('request.jwt.claims', '', false)")
        c.execute(sql, a)
        return c.fetchall() if c.description else None


def as_user(u, sql, *a):
    """Ejecuta como un jugador con sesión (u = uuid) o como visitante (u = None)."""
    with db.cursor() as c:
        if u:
            c.execute("set role authenticated; select set_config('request.jwt.claims', %s, false)",
                      (json.dumps({"sub": str(u), "role": "authenticated"}),))
        else:
            c.execute("set role anon; select set_config('request.jwt.claims', '', false)")
        try:
            c.execute(sql, a)
            r = c.fetchall() if c.description else None
            return r
        finally:
            c.execute("reset role")


def err(u, sql, *a):
    """Devuelve el mensaje de error, o None si no hubo error."""
    try:
        as_user(u, sql, *a)
        return None
    except psycopg2.Error as e:
        return (e.pgerror or str(e)).strip()


def rpc(u, fn, *a):
    ph = ",".join(["%s"] * len(a))
    r = as_user(u, f"select public.{fn}({ph})", *a)
    return r[0][0] if r else None


def new_user(email):
    return admin("insert into auth.users(email) values (%s) returning id", email)[0][0]


def name_of(u):
    return admin("select username::text from profiles where id = %s", u)[0][0]


def backdate(match, minutes):
    admin("update matches set started_at = now() - make_interval(mins => %s) where id = %s", minutes, match)


def events(kind):
    return admin("select count(*) from security_events where kind = %s", kind)[0][0]


print("Cuentas y perfiles")
A, B, C, D, E = [new_user(f"{n}@prueba.local") for n in "abcde"]
names = [name_of(x) for x in (A, B, C, D, E)]
check("cada cuenta nueva recibe un perfil con nombre único", len(set(names)) == 5, names)
try:
    new_user("a@prueba.local"); check("correo repetido rechazado", False)
except psycopg2.Error:
    check("correo repetido rechazado", True)
rpc(A, "update_profile", "Ana_01", None, "es", True, None, None)
rpc(B, "update_profile", "Beto", None, None, None, None, None)
rpc(C, "update_profile", "Carla", None, None, None, None, None)
rpc(D, "update_profile", "Dani", None, None, None, None, None)
rpc(E, "update_profile", "Eva", None, None, None, None, None)
check("cambiar nombre de usuario", name_of(A) == "Ana_01")
check("nombre ya usado (sin importar mayúsculas)", "NOMBRE_OCUPADO" in (err(B, "select update_profile('ana_01')") or ""))
check("nombre con símbolos rechazado", "NOMBRE_NO_VALIDO" in (err(B, "select update_profile('a<b>')") or ""))
check("nombre que imita al equipo del juego rechazado", "NOMBRE_NO_VALIDO" in (err(B, "select update_profile('AdminJefe')") or ""))
check("país inválido rechazado", "PAIS_NO_VALIDO" in (err(B, "select update_profile(null,null,'ESP')") or ""))
me = rpc(A, "get_me")
check("get_me devuelve mi perfil completo", me["username"] == "Ana_01" and me["country"] == "ES")
check("sin sesión no se puede editar el perfil", "NO_SESION" in (err(None, "select update_profile('x')") or "") or
      "permission denied" in (err(None, "select update_profile('x')") or ""))

print("El navegador no puede escribir puntos ni resultados")
for sql in [
    "insert into ratings(season_id,user_id,mode,points) values (1, auth.uid(), 'solo', 99999)",
    "update ratings set points = 99999",
    "insert into match_results(match_id,survived,kills,won,score) values (gen_random_uuid(),1,1,true,9999)",
    "insert into team_ratings(season_id,mode,team_key,members,points) values (1,'duo','x','{}',9999)",
    "update profiles set level = 120, xp = 999999 where id = auth.uid()",
    "insert into match_reports(match_id,user_id,survived,kills,won,level) values (gen_random_uuid(), auth.uid(),1,1,true,1)",
    "insert into matches(mode,season_id,difficulty,map) values ('solo',1,'s','forest')",
    "delete from profiles",
    "update seasons set ends_at = now()",
    "insert into season_rewards(season_id,user_id,mode,division,coins) values (1, auth.uid(),'solo','Leyenda',99999)",
    "select * from security_events",
    "select * from ratings",
    "select country from profiles",
    "select public.finalize_match(gen_random_uuid(), true)",
    "select public.close_season(1)",
    "select public.log_event(null, 'x')",
    "select public.hit_rate('x', 1, interval '1 hour')",
]:
    e = err(A, sql)
    check("bloqueado: " + sql[:70], e is not None and "permission denied" in e, e)
check("leer perfiles ajenos: solo columnas públicas",
      len(as_user(A, "select id, username, avatar, level from profiles")) >= 1)

print("Visitante sin cuenta")
check("puede ver la clasificación (vacía, sin jugadores inventados)", rpc(None, "get_leaderboard", "solo") == [])
check("no puede empezar partidas", "permission denied" in (err(None, "select start_match('s','forest')") or ""))

print("Partida en solitario")
r = rpc(A, "start_match", "s", "forest")
m1 = r["match"]
check("el servidor crea la partida y da la semilla", r["mode"] == "solo" and isinstance(r["seed"], int))
r0 = rpc(A, "start_match", "s", "forest")
check("empezar otra deja la anterior como abandonada (nunca dos a la vez)",
      admin("select status from matches where id = %s", m1)[0][0] == "abandoned" and
      admin("select count(*) from match_players where user_id = %s and active", A)[0][0] == 1)
check("...y la abandonada cuenta como partida jugada sin puntos", admin("select games, points from ratings where user_id = %s and mode = 'solo'", A)[0] == (1, 0))
m1 = r0["match"]
check("dificultad inventada rechazada", "DIFICULTAD_NO_VALIDA" in (err(B, "select start_match('z','forest')") or ""))
check("mapa inventado rechazado", "MAPA_NO_VALIDO" in (err(B, "select start_match('s','luna')") or ""))
n0 = events("resultado_imposible")
r = rpc(A, "submit_result", m1, 900, 100, True, 10)
check("aguantar 15 min en una partida empezada hace segundos: rechazado", r.get("error") == "RESULTADO_NO_VALIDO", r)
check("el intento queda registrado", events("resultado_imposible") == n0 + 1)
backdate(m1, 10)
r = rpc(A, "submit_result", m1, 590, 99999, False, 20)
check("muertes imposibles rechazadas", r.get("error") == "RESULTADO_NO_VALIDO", r)
r = rpc(A, "submit_result", m1, 590, 400, False, 300)
check("nivel imposible rechazado", r.get("error") == "RESULTADO_NO_VALIDO", r)
r = rpc(B, "submit_result", m1, 590, 400, False, 20)
check("no puedes enviar el resultado de la partida de otro", r.get("error") == "PARTIDA_NO_VALIDA", r)
check("...y queda registrado", events("resultado_ajeno") >= 1)
r = rpc(A, "submit_result", m1, 590, 400, False, 20)
check("resultado válido aceptado y puntuado por el servidor", r["status"] == "finished" and r["score"] == 98, r)
check("no se puede enviar dos veces", "YA_ENVIADO" in (err(A, f"select submit_result('{m1}',590,400,false,20)") or ""))
lb = rpc(None, "get_leaderboard", "solo")
check("aparece en la clasificación mundial", len(lb) == 1 and lb[0]["name"] == "Ana_01" and lb[0]["points"] == 98, lb)
check("con país si lo ha elegido mostrar", lb[0]["country"] == "ES")
mr = rpc(A, "get_my_rank", "solo")
check("mi posición (2 partidas: la abandonada y esta)", mr["pos"] == 1 and mr["games"] == 2 and mr["winrate"] == 0, mr)
check("filtro por país", len(rpc(None, "get_leaderboard", "solo", None, "FR")) == 0 and
      len(rpc(None, "get_leaderboard", "solo", None, "es")) == 1)
check("la experiencia la da el servidor", rpc(A, "get_me")["xp"] == 98)

print("Partida en Aventura (no cuenta)")
r = rpc(B, "start_match", "a", "forest"); backdate(r["match"], 5)
r = rpc(B, "submit_result", r["match"], 290, 100, True, 9)
check("Aventura no da puntos", r["score"] == 0 and rpc(B, "get_my_rank", "solo") is None, r)

print("Amigos, grupos e invitaciones")
check("solicitud enviada", rpc(A, "send_friend_request", "Beto") == "enviada")
check("no se duplica", rpc(A, "send_friend_request", "beto") == "ya_enviada")
check("no puedes ser tu propio amigo", "ERES_TU" in (err(A, "select send_friend_request('Ana_01')") or ""))
fl = rpc(B, "list_friends")
check("Beto ve la solicitud recibida", fl[0]["username"] == "Ana_01" and fl[0]["state"] == "recibida", fl)
rpc(B, "respond_friend_request", "Ana_01", True)
check("ya son amigos", rpc(A, "list_friends")[0]["state"] == "amigo")
p = rpc(A, "create_party", "duo")
check("grupo creado con código", len(p["code"]) == 6 and p["me_leader"])
check("solo se invita a amigos", "SOLO_AMIGOS" in (err(A, "select invite_to_party('Carla')") or ""))
rpc(A, "invite_to_party", "Beto")
inv = rpc(B, "list_invites")
check("Beto recibe la invitación", len(inv) == 1 and inv[0]["code"] == p["code"])
check("ver el grupo de otro no es posible", as_user(C, "select count(*) from parties")[0][0] == 0)
rpc(B, "join_party", p["code"])
check("Beto entra", len(rpc(A, "get_party")["members"]) == 2)
check("grupo lleno", "GRUPO_LLENO" in (err(C, f"select join_party('{p['code']}')") or ""))
check("no empieza si alguien no está listo", "NO_TODOS_LISTOS" in (err(A, "select start_match('s','forest')") or ""))
rpc(B, "set_ready", True)
check("solo el líder empieza", "SOLO_EL_LIDER" in (err(B, "select start_match('s','forest')") or ""))
check("el grupo no puede pasar a solitario con 2 personas", "DEMASIADOS_EN_EL_GRUPO" in (err(A, "select set_party_mode('solo')") or ""))
r = rpc(A, "start_match", "n", "ruins", json.dumps({"Ana_01": "willie", "Beto": "pooh"}))
m2 = r["match"]
check("partida de dúo creada", r["mode"] == "duo")
check("los listos se reinician tras empezar", all(not x["ready"] or x["leader"] for x in rpc(A, "get_party")["members"]))
try:
    admin("insert into match_players(match_id, user_id) values (%s, %s)", m1, B)
    check("la base de datos impide meter a Beto en dos partidas en curso", False)
except psycopg2.Error as e:
    check("la base de datos impide meter a Beto en dos partidas en curso", "match_players_one_active" in str(e), e)
backdate(m2, 21)
r = rpc(A, "submit_result", m2, 1200, 800, True, 30)
check("con un informe de dos, aún no se decide", r["status"] == "active", r)
r = rpc(B, "submit_result", m2, 1150, 760, True, 29)
exp = round((1150 / 60 * 10 + 50) * 1.3)
check("con los dos informes se decide con el valor más bajo", r["status"] == "finished" and r["score"] == exp and not r["flagged"], (r, exp))
t = rpc(None, "get_leaderboard", "duo", None, None, "teams")
check("clasificación de equipos", len(t) == 1 and t[0]["name"] == "Ana_01 · Beto" and t[0]["wins"] == 1, t)
check("clasificación individual de dúos", len(rpc(None, "get_leaderboard", "duo")) == 2)
check("los jugadores solo ven sus partidas", as_user(C, "select count(*) from matches")[0][0] == 0 and
      as_user(B, "select count(*) from matches where id = %s", m2)[0][0] == 1)

print("Informes que no coinciden")
rpc(B, "set_ready", True)
m3 = rpc(A, "start_match", "s", "forest")["match"]; backdate(m3, 21)
rpc(A, "submit_result", m3, 1200, 900, True, 30)
r = rpc(B, "submit_result", m3, 400, 100, False, 10)
check("se marca y se usa el valor más bajo", r["flagged"] and r["score"] == round(400 / 60 * 10), r)
check("queda registrado", events("informes_distintos") >= 1)

print("Abandono y desconexión")
rpc(B, "set_ready", True)
m4 = rpc(A, "start_match", "s", "forest")["match"]; backdate(m4, 12)
before = as_user(B, "select public.get_my_rank('duo')")[0][0]
r = rpc(B, "abandon_match", m4, 200, 50, 8)
check("Beto abandona: la partida sigue para Ana", r["status"] == "active", r)
r = rpc(A, "submit_result", m4, 700, 300, True, 22)
check("Ana termina: puntúa solo con su informe", r["status"] == "finished" and r["score"] == round(700 / 60 * 10 + 50), r)
after = as_user(B, "select public.get_my_rank('duo')")[0][0]
check("quien abandona suma partida sin puntos ni victoria",
      after["games"] == before["games"] + 1 and after["wins"] == before["wins"] and after["points"] == before["points"], (before, after))
rpc(B, "set_ready", True)
m5 = rpc(A, "start_match", "s", "forest")["match"]
admin("update matches set started_at = now() - interval '50 minutes' where id = %s", m5)
rpc(B, "set_ready", True)
r = rpc(A, "start_match", "s", "forest")
st = admin("select status from matches where id = %s", m5)[0][0]
check("una partida colgada se cierra sola y deja empezar otra", st == "abandoned" and r["match"] != m5, st)
admin("update matches set started_at = now() - interval '50 minutes' where id = %s", r["match"])
admin("select close_stale_matches()")
check("las partidas colgadas se cierran solas",
      admin("select count(*) from matches where status = 'active' and started_at < now() - interval '45 minutes'")[0][0] == 0)

print("Emparejamiento")
M = [new_user(f"m{i}@prueba.local") for i in range(7)]
for i, x in enumerate(M): rpc(x, "update_profile", f"Mm{i}", None, None, None, None, None)
r = rpc(M[0], "queue_join", "duo", "s")
check("un jugador solo espera en la cola", r["queued"] is True and r["waiting"] == 1, r)
check("el modo solitario no tiene cola", "MODO_NO_VALIDO" in (err(M[1], "select queue_join('solo')") or ""))
r = rpc(M[1], "queue_join", "duo", "n")
check("con otra dificultad no se juntan", r["queued"] is True, r)
r = rpc(M[1], "queue_join", "duo", "s")
check("con la misma dificultad se forma el grupo", r["queued"] is False and r["party"]["size"] == 2 and len(r["party"]["members"]) == 2, r)
check("el que esperaba se entera al consultar", rpc(M[0], "queue_status")["party"]["code"] == r["party"]["code"])
check("todos quedan listos para empezar", all(m["ready"] for m in r["party"]["members"]))
rpc(M[2], "create_party", "trio"); rpc(M[2], "send_friend_request", "Mm3"); rpc(M[3], "send_friend_request", "Mm2")
rpc(M[2], "invite_to_party", "Mm3"); rpc(M[3], "join_party", rpc(M[2], "get_party")["code"])
check("solo el líder busca para el grupo", "SOLO_EL_LIDER" in (err(M[3], "select queue_join('squad')") or ""))
r = rpc(M[2], "queue_join", "squad", "s")
check("un grupo de 2 busca 2 más para escuadrón", r["queued"] is True and r["waiting"] == 2, r)
check("el compañero también está en la cola", rpc(M[3], "queue_status")["queued"] is True)
rpc(M[5], "block_user", "Mm4")
rpc(M[4], "queue_join", "squad", "s")
r = rpc(M[5], "queue_join", "squad", "s")
check("no junta a jugadores que se han bloqueado", r["queued"] is True, r)
r = rpc(M[6], "queue_join", "squad", "s")
p = r.get("party") or {}
names = sorted(m["username"] for m in p.get("members", []))
check("se completa el escuadrón con el grupo y dos sueltos compatibles", r["queued"] is False and names == ["Mm2", "Mm3", "Mm4", "Mm6"], r)
check("el líder del grupo sigue siendo el líder", p.get("leader") == "Mm2")
check("nadie queda en dos grupos", admin("select count(*) - count(distinct user_id) from party_members")[0][0] == 0)
rpc(M[5], "queue_leave")
check("salir de la cola", rpc(M[5], "queue_status")["queued"] is False)
rpc(M[5], "queue_join", "trio", "x")
admin("update queue set seen_at = now() - interval '1 minute'")
rpc(M[0], "leave_party"); rpc(M[0], "queue_join", "trio", "x")
check("quien cerró el juego sale de la cola", rpc(M[5], "queue_status")["queued"] is False)
rpc(M[0], "queue_leave")

print("Privacidad, bloqueos y denuncias")
rpc(C, "update_profile", None, None, "FR", False, "private", False)
pc = rpc(D, "get_profile", "Carla")
check("perfil privado: solo nombre y nivel", pc["visible"] is False and pc["stats"] is None and pc["country"] is None, pc)
check("perfil privado no sale en la búsqueda", rpc(D, "search_players", "Car") == [])
check("historial oculto", rpc(D, "get_history", "Carla") == [])
check("el dueño sí ve su historial", isinstance(rpc(C, "get_history", "Carla"), list))
rpc(B, "update_profile", None, None, None, None, "friends", None)
check("perfil solo amigos: un amigo lo ve", rpc(A, "get_profile", "Beto")["visible"] is True)
check("perfil solo amigos: un desconocido no", rpc(D, "get_profile", "Beto")["visible"] is False)
check("país oculto si no se quiere mostrar", rpc(D, "get_profile", "Carla")["country"] is None)
rpc(D, "block_user", "Ana_01")
check("bloqueado: no puede enviar solicitud", "NO_PERMITIDO" in (err(A, "select send_friend_request('Dani')") or ""))
check("bloqueado: no ve el perfil", rpc(A, "get_profile", "Dani") is None)
check("bloqueado: no sale en la búsqueda", rpc(A, "search_players", "Da") == [])
rpc(D, "unblock_user", "Ana_01")
check("desbloquear", rpc(A, "send_friend_request", "Dani") == "enviada")
check("búsqueda sin comodines peligrosos", rpc(A, "search_players", "%") == [])
rpc(E, "report_user", "Ana_01", "trampas", "x" * 900)
check("denuncia guardada y recortada", admin("select char_length(details) from reports")[0][0] == 500)
check("motivo inventado rechazado", err(E, "select report_user('Beto','porque si')") is not None)

print("Límite de peticiones")
for _ in range(9):
    rpc(E, "report_user", "Beto", "otro")
check("demasiadas denuncias seguidas: bloqueado", "DEMASIADAS_PETICIONES" in (err(E, "select report_user('Beto','otro')") or ""))

print("Guardado en la nube")
as_user(A, "insert into saves(user_id, data) values (auth.uid(), '{\"coins\":10}')")
check("guardar mi progreso", as_user(A, "select data->>'coins' from saves")[0][0] == "10")
as_user(A, "update saves set data = '{\"coins\":20}', updated_at = now() where user_id = auth.uid()")
check("actualizar mi progreso", as_user(A, "select data->>'coins' from saves")[0][0] == "20")
check("no puedo escribir el guardado de otro", err(B, "insert into saves(user_id, data) values (%s, '{}')", A) is not None)
check("no puedo leer el guardado de otro", as_user(B, "select count(*) from saves")[0][0] == 0)
as_user(B, "update saves set data = '{\"coins\":9999}' where user_id = %s", A)
check("no puedo cambiar el guardado de otro", as_user(A, "select data->>'coins' from saves")[0][0] == "20")
check("guardado gigante rechazado", err(A, "update saves set data = jsonb_build_object('x', repeat('a', 400000)) where user_id = auth.uid()") is not None)

r1 = rpc(B, "save_progress", json.dumps({"coins": 5}), None, False)
check("primer guardado en la nube", r1["conflict"] is False)
r2 = rpc(B, "save_progress", json.dumps({"coins": 7}), r1["updated_at"], False)
check("guardar encima del mío", r2["conflict"] is False and rpc(B, "load_progress")["data"]["coins"] == 7)
r3 = rpc(B, "save_progress", json.dumps({"coins": 1}), r1["updated_at"], False)
check("otro móvil con un guardado viejo no pisa el nuevo", r3["conflict"] is True and r3["data"]["coins"] == 7, r3)
rpc(B, "save_progress", json.dumps({"coins": 1}), None, True)
check("el jugador puede elegir quedarse con el otro", rpc(B, "load_progress")["data"]["coins"] == 1)
check("guardado que no es un objeto rechazado", "GUARDADO_NO_VALIDO" in (err(B, "select save_progress('[1,2]'::jsonb)") or ""))
check("cada uno carga solo lo suyo", rpc(C, "load_progress") is None)

print("Cuentas bloqueadas por el equipo")
admin("update profiles set banned = true where id = %s", E)
check("no puede jugar", "CUENTA_BLOQUEADA" in (err(E, "select start_match('s','forest')") or ""))
admin("update profiles set banned = false where id = %s", E)

print("Temporadas")
admin("update seasons set ends_at = now() - interval '1 second', starts_at = now() - interval '8 weeks' where id = 1")
ls = rpc(None, "list_seasons")
cur = [s for s in ls if s["current"]]
check("al acabar la temporada empieza la siguiente", len(cur) == 1 and cur[0]["id"] == 2, ls)
check("la nueva temporada empieza vacía", rpc(None, "get_leaderboard", "solo") == [])
check("la anterior se puede consultar", len(rpc(None, "get_leaderboard", "solo", 1)) == 1)
c1 = rpc(A, "claim_season_rewards")["coins"]
check("recompensa de temporada", c1 > 0, c1)
check("la recompensa solo se cobra una vez", rpc(A, "claim_season_rewards")["coins"] == 0)

print("Descargar y borrar mis datos")
ex = rpc(A, "export_my_data")
check("la descarga incluye perfil, guardado, partidas y puntos",
      ex["perfil"]["username"] == "Ana_01" and ex["guardado"]["coins"] == 20 and len(ex["partidas"]) >= 4 and len(ex["puntos"]) >= 1)
check("la descarga no incluye datos de otros", "Beto" not in json.dumps(ex["puntos"]))
rpc(A, "delete_my_account")
check("cuenta borrada", admin("select count(*) from auth.users where id = %s", A)[0][0] == 0 and
      admin("select count(*) from profiles where id = %s", A)[0][0] == 0)
check("sale de las clasificaciones", rpc(None, "get_leaderboard", "solo", 1) == [] and
      rpc(None, "get_leaderboard", "duo", 1, None, "teams") == [])
check("su guardado y amistades se borran", admin("select count(*) from saves where user_id = %s", A)[0][0] == 0 and
      admin("select count(*) from friendships where %s in (requester, addressee)", A)[0][0] == 0)
check("Beto sigue en el grupo y ahora es líder", rpc(B, "get_party")["me_leader"] is True)
rpc(D, "update_profile", "Ana_01")
check("el nombre queda libre", name_of(D) == "Ana_01")

print(f"\n{ok} pruebas bien, {fail} fallos")
sys.exit(1 if fail else 0)
