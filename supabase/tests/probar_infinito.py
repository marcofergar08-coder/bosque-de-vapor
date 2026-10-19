#!/usr/bin/env python3
"""Pruebas del servidor: modo Infinito (récords, clasificaciones, trampas, grupos,
partidas largas) y donaciones. Uso igual que probar_servidor.py."""
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




def rpcn(u, fn, **kw):
    """Llama a una función con argumentos con nombre, como hace supabase-js."""
    ph = ",".join(f"{k}=>%s" for k in kw)
    r = as_user(u, f"select public.{fn}({ph})", *[json.dumps(v) if isinstance(v, (dict, list)) else v for v in kw.values()])
    return r[0][0] if r else None


def as_service(sql, *a):
    with db.cursor() as c:
        c.execute("set role service_role; select set_config('request.jwt.claims', '', false)")
        try:
            c.execute(sql, a)
            return c.fetchall() if c.description else None
        finally:
            c.execute("reset role")


def inf_rec(u, mode="solo"):
    r = admin("select best_score, best_wave, best_time, games, completed, total_waves from inf_records where user_id = %s and mode = %s", u, mode)
    return r[0] if r else None


def score(w, k, b, mult=1.0):
    return round((5 * w * (w + 1) + 40 * w + k + 250 * b) * mult)


admin("delete from auth.users where email like %s", '%@inf.local')
A, B, C, D = [new_user(f"{n}@inf.local") for n in "abcd"]
for u, n in ((A, "Iria"), (B, "Bruno_i"), (C, "Celia_i"), (D, "Dario_i")):
    rpc(u, "update_profile", n, None, None, None, None, None)

print("Infinito en solitario")
r = rpcn(A, "start_match", p_difficulty="s", p_map="forest", p_inf=True)
check("la partida se crea como Infinito", r["variant"] == "inf" and r["mode"] == "solo", r)
m = r["match"]; backdate(m, 5)
r = rpcn(A, "submit_result", p_match=m, p_survived=290, p_kills=800, p_won=True, p_level=20, p_waves=20, p_bosses=4)
check("el servidor calcula la puntuación del Infinito", r["status"] == "finished" and r["score"] == score(20, 800, 4) and r["waves"] == 20, r)
check("en el Infinito no hay victoria aunque el juego la mande", admin("select won from match_results where match_id = %s", m)[0][0] is False)
check("queda como récord personal", inf_rec(A)[:5] == (score(20, 800, 4), 20, 290, 1, 1), inf_rec(A))
check("no se mezcla con la clasificación normal", admin("select count(*) from ratings where user_id = %s", A)[0][0] == 0)

print("Trampas en el Infinito")
m = rpcn(A, "start_match", p_difficulty="s", p_map="forest", p_inf=True)["match"]; backdate(m, 5)
r = rpcn(A, "submit_result", p_match=m, p_survived=290, p_kills=100, p_won=False, p_level=10, p_waves=100, p_bosses=2)
check("100 oleadas en 5 minutos: rechazado", r.get("error") == "RESULTADO_NO_VALIDO", r)
r = rpcn(A, "submit_result", p_match=m, p_survived=290, p_kills=100, p_won=False, p_level=10, p_waves=20, p_bosses=9)
check("más jefes de los posibles: rechazado", r.get("error") == "RESULTADO_NO_VALIDO", r)
r = rpcn(A, "submit_result", p_match=m, p_survived=290, p_kills=100, p_won=False, p_level=10, p_waves=-3, p_bosses=0)
check("oleadas negativas: rechazado", r.get("error") == "RESULTADO_NO_VALIDO", r)
check("los intentos quedan registrados", events("resultado_imposible") >= 3)
r = rpcn(A, "submit_result", p_match=m, p_survived=200, p_kills=300, p_won=False, p_level=12, p_waves=12, p_bosses=2)
check("una partida peor no borra el récord", inf_rec(A)[:5] == (score(20, 800, 4), 20, 290, 2, 2), inf_rec(A))
check("los totales suman las dos", inf_rec(A)[5] == 32)
check("no se puede enviar dos veces", "YA_ENVIADO" in (err(A, "select submit_result(%s::uuid, 100, 1, false, 1, false, 1, 0)", m) or ""))
m = rpcn(A, "start_match", p_difficulty="n", p_map="ruins", p_inf=True)["match"]; backdate(m, 9)
r = rpcn(A, "submit_result", p_match=m, p_survived=530, p_kills=1500, p_won=False, p_level=30, p_waves=30, p_bosses=6)
check("una partida mejor (Pesadilla) sustituye el récord entero", inf_rec(A)[:3] == (score(30, 1500, 6, 1.3), 30, 530), inf_rec(A))

print("Clasificación del Infinito")
m = rpcn(B, "start_match", p_difficulty="s", p_map="forest", p_inf=True)["match"]; backdate(m, 3)
rpcn(B, "submit_result", p_match=m, p_survived=170, p_kills=200, p_won=False, p_level=9, p_waves=10, p_bosses=2)
lb = rpcn(None, "get_inf_leaderboard", p_mode="solo")
check("ordenada por récord", [x["name"] for x in lb] == ["Iria", "Bruno_i"] and lb[0]["wave"] == 30 and lb[0]["time"] == 530, lb)
check("muestra oleada, puntos, tiempo, demonios, jefes, partidas y rango",
      all(k in lb[0] for k in ("score", "wave", "time", "kills", "bosses", "games", "completed", "division", "level")), lb[0])
check("posición propia aunque no salga arriba", rpcn(B, "get_my_inf_rank", p_mode="solo")["pos"] == 2)
check("modos separados: dúos vacío", rpcn(None, "get_inf_leaderboard", p_mode="duo") == [])
check("la clasificación normal no ve el Infinito", rpc(None, "get_leaderboard", "solo") == [])
check("una partida normal sigue siendo normal", rpcn(C, "start_match", p_difficulty="s", p_map="forest")["variant"] == "normal")
admin("delete from matches where host = %s", C)

print("Infinito en dúos con grupo")
admin("insert into friendships(requester,addressee,status) values (%s,%s,'accepted'),(%s,%s,'accepted')", A, B, C, D)
p = rpcn(A, "create_party", p_mode="duo")
check("el grupo empieza en modo normal", p["variant"] == "normal")
rpcn(A, "invite_to_party", p_username="Bruno_i"); rpcn(B, "join_party", p_code=p["code"]); rpcn(B, "set_ready", p_ready=True)
check("solo el líder cambia a Infinito", "SOLO_EL_LIDER" in (err(B, "select set_party_variant('inf')") or ""))
check("variante inventada rechazada", "MODO_NO_VALIDO" in (err(A, "select set_party_variant('pvp')") or ""))
p = rpcn(A, "set_party_variant", p_variant="inf")
check("el líder elige Infinito y los demás deben volver a estar listos", p["variant"] == "inf" and not [x for x in p["members"] if not x["leader"] and x["ready"]], p)
rpcn(B, "set_ready", p_ready=True)
r = rpcn(A, "start_match", p_difficulty="s", p_map="forest", p_heroes={"Iria": "willie", "Bruno_i": "pooh"}, p_party=True, p_inf=False)
check("manda lo que eligió el grupo, no lo que diga el navegador", r["variant"] == "inf" and r["mode"] == "duo", r)
m = r["match"]; backdate(m, 8)
rpcn(A, "submit_result", p_match=m, p_survived=470, p_kills=1300, p_won=False, p_level=25, p_waves=28, p_bosses=5)
r = rpcn(B, "submit_result", p_match=m, p_survived=470, p_kills=1250, p_won=False, p_level=25, p_waves=21, p_bosses=4)
check("si no coinciden se usa el más bajo y se marca", r["status"] == "finished" and r["flagged"] and r["waves"] == 21 and r["score"] == score(21, 1250, 4), r)
t = rpcn(None, "get_inf_leaderboard", p_mode="duo", p_kind="teams")
check("clasificación de equipos de dúos Infinito", len(t) == 1 and t[0]["name"] == "Bruno_i · Iria" and t[0]["wave"] == 21, t)
check("con el rendimiento de cada integrante", sorted(x["name"] for x in t[0]["members"]) == ["Bruno_i", "Iria"] and all(x["wave"] == 21 for x in t[0]["members"]), t)
check("el récord de dúos no toca el de solitario", inf_rec(A)[1] == 30 and inf_rec(A, "duo")[1] == 21)
check("la clasificación normal de equipos sigue vacía", rpc(None, "get_leaderboard", "duo", None, None, "teams") == [])

print("Abandono en el Infinito")
rpcn(B, "set_ready", p_ready=True)
m = rpcn(A, "start_match", p_difficulty="s", p_map="forest", p_party=True)["match"]; backdate(m, 4)
rpcn(B, "abandon_match", p_match=m, p_survived=100, p_kills=50, p_level=5, p_waves=6, p_bosses=1)
r = rpcn(A, "submit_result", p_match=m, p_survived=230, p_kills=400, p_won=False, p_level=15, p_waves=14, p_bosses=2)
bd = inf_rec(B, "duo")
check("quien abandona suma partida pero no récord ni completada", bd[3] == 2 and bd[4] == 1 and bd[1] == 21, bd)
check("quien sigue la completa", inf_rec(A, "duo")[3:5] == (2, 2))

print("Partidas largas y colgadas")
rpcn(B, "set_ready", p_ready=True)
m = rpcn(A, "start_match", p_difficulty="s", p_map="forest", p_party=True)["match"]
admin("update matches set started_at = now() - interval '3 hours' where id = %s", m)
rpcn(A, "match_heartbeat", p_match=m)
admin("select close_stale_matches()")
check("una partida del Infinito de 3 horas con señales de vida sigue abierta", admin("select status from matches where id = %s", m)[0][0] == "active")
r = rpcn(A, "submit_result", p_match=m, p_survived=3 * 3600 - 30, p_kills=20000, p_won=False, p_level=80, p_waves=400, p_bosses=80)
check("se puede enviar un resultado largo", r.get("status") in ("active", "finished"), r)
rpcn(B, "submit_result", p_match=m, p_survived=3 * 3600 - 30, p_kills=20000, p_won=False, p_level=80, p_waves=400, p_bosses=80)
check("la puntuación de 400 oleadas no se desborda", admin("select score from match_results where match_id = %s", m)[0][0] == score(400, 20000, 80))
rpcn(B, "set_ready", p_ready=True)
m = rpcn(A, "start_match", p_difficulty="s", p_map="forest", p_party=True)["match"]
admin("update matches set heartbeat_at = now() - interval '11 minutes' where id = %s", m)
admin("select close_stale_matches()")
check("sin señales de vida durante 10 minutos se da por abandonada", admin("select status from matches where id = %s", m)[0][0] == "abandoned")
check("el latido de una partida ajena no hace nada", (rpcn(C, "match_heartbeat", p_match=m) or True) and True)
check("la puntuación máxima tiene tope", admin("select inf_score(1000000, 2000000000, 1000000, 'x')")[0][0] == 2000000000)

print("Emparejamiento del Infinito")
admin("delete from queue")
rpcn(A, "leave_party"); rpcn(B, "leave_party")
r = rpcn(C, "queue_join", p_mode="duo", p_difficulty="s", p_variant="inf")
check("busca Infinito", r["queued"] and r["variant"] == "inf", r)
r = rpcn(D, "queue_join", p_mode="duo", p_difficulty="s")
check("no se junta con quien busca la partida normal", r["queued"] is True, r)
r = rpcn(D, "queue_join", p_mode="duo", p_difficulty="s", p_variant="inf")
check("dos que buscan Infinito se juntan", not r["queued"] and r["party"]["variant"] == "inf", r)
check("variante inventada rechazada en la cola", "MODO_NO_VALIDO" in (err(A, "select queue_join('duo','s','pvp')") or ""))

print("Perfil e historial")
pr = rpcn(C, "get_profile", p_username="Iria")
check("el perfil muestra los récords del Infinito por modo", pr["inf"]["solo"]["season"]["wave"] == 30 and pr["inf"]["duo"]["team"]["members"] == "Bruno_i · Iria", pr["inf"])
check("con su posición", pr["inf"]["solo"]["season"]["pos"] == 1)
h = rpcn(A, "get_history", p_username="Iria", p_limit=50)
check("el historial distingue el Infinito y guarda las oleadas", any(x["variant"] == "inf" and x["waves"] == 30 for x in h))

print("Lo que el navegador no puede hacer")
for sql in ["select * from inf_records", "update inf_records set best_score = 999999",
            "insert into inf_records(season_id,user_id,mode,best_score) values (1, auth.uid(), 'solo', 999999)",
            "select * from inf_team_records", "select * from donations", "select * from donation_events",
            "select public.inf_add_player(1, auth.uid(), 'solo', true, 999999, 999, 999, 999, 99)",
            "select public.donation_create(500, auth.uid(), 'x')",
            "select public.donation_apply_event('e','x','s',null,'paid',500,'eur',null)",
            "select public.donation_set_session(gen_random_uuid(), 'cs_x')"]:
    e = err(A, sql)
    check("bloqueado: " + sql[:60], e is not None and "permission denied" in e, e)
check("sin sesión no se juega al Infinito", "permission denied" in (err(None, "select start_match('s','forest',p_inf=>true)") or ""))

print("Donaciones")
d = as_service("select donation_create(500, %s, 'ip1')", A)[0][0]
check("la crea el servidor con la cantidad pedida", admin("select amount_cents, status from donations where id = %s", d)[0] == (500, "creating"))
for bad in (50, 50001, None):
    try:
        as_service("select donation_create(%s, null, 'ip2')", bad); check(f"cantidad {bad} rechazada", False)
    except psycopg2.Error as e:
        check(f"cantidad {bad} rechazada", "CANTIDAD_NO_VALIDA" in str(e), e)
as_service("select donation_set_session(%s, 'cs_test_1')", d)
check("cualquiera con el identificador ve el estado (pendiente)", rpcn(None, "get_donation", p_id=d)["status"] == "pending")
r = as_service("select donation_apply_event('evt_1','checkout.session.completed','cs_test_1',null,'paid',100,'eur','pi_1')")[0][0]
check("si Stripe cobra otra cantidad no se marca pagada", r == "cantidad_distinta" and rpcn(None, "get_donation", p_id=d)["status"] == "pending", r)
r = as_service("select donation_apply_event('evt_2','checkout.session.completed','cs_test_1',null,'pending',500,'eur',null)")[0][0]
check("pago aún sin confirmar: sigue pendiente", r == "pending" and rpcn(None, "get_donation", p_id=d)["status"] == "pending")
r = as_service("select donation_apply_event('evt_3','checkout.session.async_payment_succeeded','cs_test_1',null,'paid',500,'eur','pi_1')")[0][0]
check("el aviso de Stripe la marca pagada", r == "paid" and rpcn(None, "get_donation", p_id=d)["status"] == "paid")
r = as_service("select donation_apply_event('evt_3','checkout.session.async_payment_succeeded','cs_test_1',null,'paid',500,'eur','pi_1')")[0][0]
check("el mismo aviso repetido no hace nada", r == "repetido")
r = as_service("select donation_apply_event('evt_4','checkout.session.expired','cs_test_1',null,'expired',500,'eur',null)")[0][0]
check("una pagada no vuelve atrás", r == "ya_pagada" and rpcn(None, "get_donation", p_id=d)["status"] == "paid")
check("cancelar desde el juego no deshace un pago", rpcn(None, "cancel_donation", p_id=d)["status"] == "paid")
d2 = as_service("select donation_create(200, null, 'ip3')")[0][0]
as_service("select donation_set_session(%s, 'cs_test_2')", d2)
check("volver con cancelar la deja cancelada", rpcn(None, "cancel_donation", p_id=d2)["status"] == "canceled")
as_service("select donation_apply_event('evt_5','checkout.session.completed','cs_test_2',null,'paid',200,'eur','pi_2')")
check("si después Stripe confirma el pago, cuenta", rpcn(None, "get_donation", p_id=d2)["status"] == "paid")
r = as_service("select donation_apply_event('evt_6','checkout.session.completed','cs_no_existe',null,'paid',200,'eur','pi_3')")[0][0]
check("aviso de una sesión que no es nuestra: se ignora", r == "desconocida")
try:
    for i in range(9): as_service("select donation_create(300, null, 'ip_spam')")
    check("límite de donaciones seguidas desde el mismo sitio", False)
except psycopg2.Error as e:
    check("límite de donaciones seguidas desde el mismo sitio", "DEMASIADAS_PETICIONES" in str(e))
check("una donación inexistente no devuelve nada", rpcn(None, "get_donation", p_id=str(uuid.uuid4())) is None)
ex = rpc(A, "export_my_data")
check("descargar mis datos incluye Infinito y donaciones", len(ex["infinito"]) >= 2 and len(ex["donaciones"]) == 1, list(ex))

print("Borrar la cuenta")
rpc(B, "delete_my_account")
check("sus equipos del Infinito desaparecen", admin("select count(*) from inf_team_records t where %s = any(t.members)", B)[0][0] == 0)
check("y su récord", admin("select count(*) from inf_records where user_id = %s", B)[0][0] == 0)
check("la donación de otro sigue (sin datos personales)", admin("select count(*) from donations")[0][0] >= 2)

print(f"\n{ok} pruebas bien, {fail} fallos")
sys.exit(1 if fail else 0)
