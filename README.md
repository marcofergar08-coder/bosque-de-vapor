# Bosque de Vapor: app para iPhone

Este proyecto convierte el juego (`www/index.html`) en una app de iPhone con Capacitor. La app se compila en la nube con Codemagic, así que no hace falta un Mac.

## Lo que necesitas (una sola vez)

1. **Cuenta de desarrollador de Apple.** Date de alta en [developer.apple.com/programs](https://developer.apple.com/programs/). Cuesta 99 € al año y Apple puede tardar uno o dos días en aprobarla.
2. **Cuenta de GitHub** (gratis): [github.com/signup](https://github.com/signup). Aquí se guarda el proyecto para que Codemagic pueda leerlo.
3. **Cuenta de Codemagic** (tiene plan gratuito): [codemagic.io](https://codemagic.io). Entra con tu cuenta de GitHub.

## Pasos

1. **Crear la app en App Store Connect.** En [appstoreconnect.apple.com](https://appstoreconnect.apple.com), ve a *Apps*, pulsa *+* y luego *Nueva app*. Rellena:
   - Nombre: Bosque de Vapor
   - Idioma principal: Español
   - ID del paquete (bundle ID): `com.marcofernandez.bosquedevapor`. Si no aparece en la lista, créalo primero en developer.apple.com, en *Identifiers*.
   - SKU: `bosquedevapor`
2. **Crear una clave de API.** En App Store Connect, entra en *Usuarios y acceso*, luego en *Integraciones* y después en *App Store Connect API*. Crea una clave con acceso de *App Manager* y descarga el archivo `.p8`. Ese archivo solo se puede descargar una vez.
3. **Dar la clave a Codemagic.** En Codemagic, ve a *Team settings*, luego a *Integrations* y después a *Developer Portal*. Pulsa *Manage keys* y añade la clave:
   - Nombre: `bosque_asc`, exactamente así.
   - Issuer ID y Key ID: los ves en App Store Connect.
   - Archivo: el `.p8` que descargaste.
4. **Conectar el proyecto.** En Codemagic, pulsa *Add application* y elige el repositorio de GitHub donde está este proyecto. Codemagic leerá `codemagic.yaml` solo.
5. **Compilar.** Pulsa *Start new build* y elige el flujo *iPhone (TestFlight)*. Al terminar, la app aparece en TestFlight.
6. **Probarla en tu iPhone.** Instala la app TestFlight desde la App Store y abre la invitación que te llega.
7. **Mandarla a revisión.** En App Store Connect, completa la ficha de la app: capturas, descripción, clasificación por edades y política de privacidad. Elige la compilación y pulsa *Enviar a revisión*.

## Actualizar el juego

El juego se construye a partir de `juego/base.html` (la versión 8) y las capas de `juego/capas/`
(online, cuentas, amigos y grupos, partidas clasificadas y clasificación). Después de cambiar algo:

```
npm install
python3 juego/construir.py   # crea www/index.html
npx cap sync                 # lo copia a los proyectos de iPhone y Android
```

## Servidor (cuentas, amigos, clasificación)

Ver [SERVIDOR.md](SERVIDOR.md). Sin servidor configurado el juego funciona igual que antes:
se juega solo o con amigos por código de sala, y el progreso se guarda en el dispositivo.

## Notas

- El icono (`assets/icon.png`) es provisional, sacado del logo del menú. Para cambiarlo, sustituye `assets/icon.png` (1024 × 1024, sin transparencia) y regenera los iconos con `npx @capacitor/assets generate`.
- La carpeta `android/` ya está preparada por si más adelante quieres sacar el juego en Google Play.
