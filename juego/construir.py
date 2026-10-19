#!/usr/bin/env python3
"""Construye el juego en un único archivo HTML: www/index.html.

  juego/base.html          el juego original (versión 8)
  juego/capas/*.js         capas nuevas, en el orden de CAPAS
  node_modules/...         PeerJS y supabase-js, que se incrustan dentro del archivo

Uso: npm install && python3 juego/construir.py [salida.html]
"""
import os, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPAS = ['online.js', 'cuentas.js', 'social.js']
leer = lambda *p: open(os.path.join(R, *p), encoding='utf-8').read()
def sin_mapa(js): return '\n'.join(l for l in js.split('\n') if not l.startswith('//# sourceMappingURL')).strip()
g = leer('juego', 'base.html')
pj = sin_mapa(leer('node_modules', 'peerjs', 'dist', 'peerjs.min.js'))
sb = sin_mapa(leer('node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'))
assert '</script>' not in pj and '</script>' not in sb
code = ''.join(leer('juego', 'capas', c) for c in CAPAS)
def cambia(a, b):
    global g
    assert g.count(a) == 1, a[:60]
    g = g.replace(a, b)
cambia('<div id="ov"></div><div id="film"></div><div id="vig"></div>\n<script>',
       '<div id="ov"></div><div id="film"></div><div id="vig"></div>\n'
       '<script>/* PeerJS 1.5.5 (licencia MIT): conexión directa entre jugadores */\n' + pj + '\n</script>\n'
       '<script>/* supabase-js 2.117.2 (licencia MIT): cuentas, nube y clasificaciones */\n' + sb + '\n</script>\n<script>')
cambia('lst.push([P.y,drawHero]);', 'lst.push([P.y,drawHero]);netOthers(lst);')
cambia('applyOpts();menu();requestAnimationFrame(loop);', code + '\napplyOpts();menu();requestAnimationFrame(loop);')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(R, 'www', 'index.html')
open(out, 'w', encoding='utf-8').write(g)
print(out, len(g), 'bytes')
