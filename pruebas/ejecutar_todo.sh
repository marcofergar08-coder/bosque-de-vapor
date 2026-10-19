#!/bin/bash
# Ejecuta todas las pruebas (ver pruebas/README.md para preparar el servidor local).
cd "$(dirname "$0")/.."
export PLAYWRIGHT=${PLAYWRIGHT:-playwright}
r=0
echo "== Servidor =="; python3 supabase/tests/probar_servidor.py "${BDV_DSN:-host=/tmp/pg port=5433 dbname=bdv user=postgres}" | tail -1 || r=1
for t in cuentas social partida-grupo emparejamiento clasificacion online-4-jugadores; do
  echo "== $t =="; node pruebas/navegador/$t.js > /tmp/prueba_$t.log 2>&1 || r=1; tail -1 /tmp/prueba_$t.log; grep FALLO /tmp/prueba_$t.log
done
exit $r
