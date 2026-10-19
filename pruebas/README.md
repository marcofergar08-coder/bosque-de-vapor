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
2. En `pruebas/servidor-local`: `python3 smtp.py &`, `auth serve &`, `node gateway.js &`.
3. Sirve el repositorio en el puerto 8765 (`python3 -m http.server 8765`).
4. `node pruebas/navegador/cuentas.js`

Las claves de `gotrue.env.sh` son solo para pruebas locales; no son secretos reales.
