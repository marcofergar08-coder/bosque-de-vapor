# Buzón de correo local para las pruebas: acepta todo y guarda cada mensaje en mail/.
import socketserver, os, time
os.makedirs('mail', exist_ok=True)

class H(socketserver.StreamRequestHandler):
    def w(self, s): self.wfile.write((s + '\r\n').encode())
    def handle(self):
        self.w('220 prueba ESMTP')
        rcpt, data = [], None
        while True:
            line = self.rfile.readline()
            if not line: return
            l = line.decode(errors='replace').strip()
            u = l.upper()
            if u.startswith('EHLO'):
                self.wfile.write(b'250-prueba\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n')
            elif u.startswith('HELO'): self.w('250 prueba')
            elif u.startswith('AUTH'): self.w('235 ok')
            elif u.startswith('MAIL'): rcpt = []; self.w('250 ok')
            elif u.startswith('RCPT'): rcpt.append(l.split(':', 1)[1].strip('<> ')); self.w('250 ok')
            elif u == 'DATA':
                self.w('354 go'); buf = []
                while True:
                    x = self.rfile.readline()
                    if x in (b'.\r\n', b'.\n', b''): break
                    buf.append(x.decode(errors='replace'))
                fn = 'mail/%d_%s.eml' % (time.time() * 1000, rcpt[0] if rcpt else 'x')
                open(fn, 'w').write(''.join(buf)); self.w('250 ok')
            elif u == 'QUIT': self.w('221 bye'); return
            else: self.w('250 ok')

socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer(('127.0.0.1', 2500), H).serve_forever()
