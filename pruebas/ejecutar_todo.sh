#!/bin/bash
# Ejecuta todas las pruebas (ver pruebas/README.md para preparar el servidor local).
cd "$(dirname "$0")/.."
export PLAYWRIGHT=${PLAYWRIGHT:-playwright}
r=0
# Las pruebas del servidor necesitan una base de datos recién creada (se crea sola si no se da BDV_DSN).
if [ -z "$BDV_DSN" ]; then
  PG="psql -h /tmp/pg -p 5433 -U postgres -q -v ON_ERROR_STOP=1"
  $PG -c "drop database if exists bdv_pruebas" -c "create database bdv_pruebas" 2>&1 | grep -v NOTICE
  for f in supabase/tests/00_emular_supabase.sql supabase/migrations/0001_competitivo.sql supabase/migrations/0001_competitivo.sql; do
    $PG -d bdv_pruebas -f $f 2>&1 | grep -v NOTICE; done   # la migración dos veces: se puede volver a ejecutar sin romper nada
fi
DSN="${BDV_DSN:-host=/tmp/pg port=5433 dbname=bdv_pruebas user=postgres}"
echo "== Servidor =="; python3 supabase/tests/probar_servidor.py "$DSN" | tail -1; [ ${PIPESTATUS[0]} = 0 ] || r=1
echo "== Servidor: Infinito =="; python3 supabase/tests/probar_infinito.py "$DSN" | tail -1; [ ${PIPESTATUS[0]} = 0 ] || r=1
echo "== Donaciones (servidor) =="; node supabase/tests/probar_donaciones.mjs > /tmp/prueba_donaciones-servidor.log 2>&1 || r=1; tail -1 /tmp/prueba_donaciones-servidor.log; grep FALLO /tmp/prueba_donaciones-servidor.log
for t in cuentas social partida-grupo emparejamiento clasificacion online-4-jugadores infinito infinito-grupo infinito-cuentas donaciones; do
  echo "== $t =="; node pruebas/navegador/$t.js > /tmp/prueba_$t.log 2>&1 || r=1; tail -1 /tmp/prueba_$t.log; grep FALLO /tmp/prueba_$t.log
done
exit $r
