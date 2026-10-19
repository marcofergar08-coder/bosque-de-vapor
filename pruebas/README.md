# Pruebas

## Servidor (permisos, trampas, puntos)

Necesita PostgreSQL 16 y `pip install psycopg2-binary`.

```
createdb bdv
psql -d bdv -f supabase/tests/00_emular_supabase.sql
psql -d bdv -f supabase/migrations/0001_competitivo.sql
python3 supabase/tests/probar_servidor.py "dbname=bdv"
```

## Cuentas en el navegador (de principio a fin)

Usa el servidor de cuentas real de Supabase (GoTrue, compilado desde
github.com/supabase/auth), un buzón de correo local (`smtp.py`) y una pasarela
(`gateway.js`) que hace lo mismo que Supabase con `/auth/v1` y `/rest/v1/rpc`.

1. Base de datos `sbe2e` con el esquema `auth` creado por `auth migrate`
   (variables en `servidor-local/gotrue.env.sh`) y después la migración del juego.
2. En `pruebas/servidor-local`: `python3 smtp.py &`, `auth serve &`, `node gateway.js &`,
   `node peerserver.js &` (partidas online), `node funciones.mjs &` (funciones del servidor) y
   `node stripe-falso.mjs &` (imitación de Stripe para las donaciones: no cobra nada).
3. Sirve el repositorio en el puerto 8766 (`python3 -m http.server 8766`).
4. `bash pruebas/ejecutar_todo.sh` (o cada prueba suelta, por ejemplo `node pruebas/navegador/cuentas.js`).

| Prueba | Qué comprueba |
|---|---|
| `supabase/tests/probar_servidor.py` | permisos, trampas, puntos, grupos, temporadas |
| `supabase/tests/probar_infinito.py` | récords y tablas del Infinito, oleadas imposibles, partidas de horas, abandono |
| `supabase/tests/probar_donaciones.mjs` | funciones de donación con avisos firmados: pagada, cancelada, pendiente, fallida, caducada, repetida, falsa |
| `navegador/infinito.js` | Infinito en solitario: oleadas, jefes, eventos, hitos, 300 oleadas aceleradas (memoria y rendimiento) |
| `navegador/infinito-grupo.js` | Infinito con 4 jugadores: caídos, reanimación, reconexión, final igual para todos |
| `navegador/infinito-cuentas.js` | Infinito clasificado en solitario y dúo, tablas, perfil e historial |
| `navegador/donaciones.js` | «Apoyar al creador» de principio a fin con el Stripe falso |

Las claves de `gotrue.env.sh` son solo para pruebas locales; no son secretos reales.
