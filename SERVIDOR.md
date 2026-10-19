# Conectar el servidor (Supabase)

Las cuentas, el progreso en la nube, los amigos, los grupos, el emparejamiento, la clasificación mundial (también la del Modo Infinito) y las donaciones usan **Supabase**. Su plan gratuito es suficiente para empezar. Mientras no lo conectes, el juego funciona igual que antes y no se conecta a nada.

Los pasos marcados como **imprescindible** son necesarios para que el sistema funcione. Los demás activan métodos de acceso concretos.

## 1. Crear el proyecto (imprescindible)

1. Entra en [supabase.com](https://supabase.com) con tu cuenta de GitHub y pulsa *New project*.
2. Ponle de nombre `bosque-de-vapor` y elige una región de Europa. Guarda la contraseña de la base de datos en un lugar seguro.
3. Ve a *SQL Editor*, pega todo el contenido de [`supabase/migrations/0001_competitivo.sql`](supabase/migrations/0001_competitivo.sql) y pulsa *Run*. Puedes volver a ejecutarlo más adelante sin que se borre nada.
4. Ve a *Project Settings* y luego a *API*. Copia la **Project URL** y la clave **anon** o **publishable**. Esta clave es pública y está pensada para ir dentro del juego. La clave `service_role` es secreta: no la pongas nunca en el juego ni se la pases a nadie.
5. Pon esos dos valores en `juego/capas/cuentas.js`, en la primera línea de código: `const SB={url:'…',key:'…'}`. Después vuelve a construir el juego con `python3 juego/construir.py` y `npx cap sync`. Si prefieres, pásame los dos valores y lo hago yo.

## 2. Direcciones de vuelta (imprescindible)

Ve a *Authentication* y luego a *URL Configuration*.

- **Site URL:** la dirección donde publiques la versión web del juego, por ejemplo `https://marcofergar08-coder.github.io/bosque-de-vapor/`.
- **Redirect URLs:** añade esa misma dirección y también `bosquedevapor://auth`. La segunda es la de la app del móvil.

## 3. Correo (imprescindible para cuentas con correo)

El correo que trae Supabase de serie solo sirve para pruebas: envía muy pocos mensajes por hora y solo a los miembros del proyecto. Para jugadores reales:

1. Crea una cuenta en un servicio de envío de correo. Por ejemplo, [Resend](https://resend.com) tiene un plan gratuito.
2. Ve a *Authentication*, luego a *Emails* y después a *SMTP Settings*, y pon los datos de ese servicio.
3. En *Email Templates*, traduce al español los mensajes de *Confirm signup* y *Reset password*.

Comprueba también que esté activada la opción *Confirm email*. Viene activada por defecto.

## 4. Google (opcional)

1. En [console.cloud.google.com](https://console.cloud.google.com), ve a *APIs y servicios*, luego a *Credenciales*, y crea un *ID de cliente de OAuth* de tipo *Aplicación web*.
2. En *URI de redirección autorizados*, pon `https://TU-PROYECTO.supabase.co/auth/v1/callback`.
3. En Supabase, ve a *Authentication* y luego a *Sign In / Providers*. Activa *Google* y pega el ID de cliente y el secreto.

## 5. Discord (opcional)

1. En [discord.com/developers/applications](https://discord.com/developers/applications), crea una aplicación. En *OAuth2*, añade la misma dirección de redirección del paso anterior.
2. En Supabase, activa *Discord* y pega el *Client ID* y el *Client Secret*.

## 6. Apple (necesario para la App Store si ofreces Google o Discord)

Apple exige que una app que permite entrar con Google también permita entrar con Apple. Para esto hace falta la cuenta de desarrollador de Apple (99 € al año).

1. En developer.apple.com, crea un *Services ID* y una clave de *Sign in with Apple*.
2. En Supabase, activa *Apple* y rellena los datos.

## 7. Vincular métodos de acceso

Para que un jugador pueda vincular Google, Apple o Discord a la cuenta que ya tiene, ve a *Authentication*, luego a *Sign In / Providers*, y activa *Allow manual linking*.

## 8. Partidas online por internet (recomendado antes de publicar)

Las partidas usan una conexión directa entre los móviles. Esto ya funciona en local con hasta 4 jugadores.

- Para encontrar la sala se usa por defecto el servidor público y gratuito de PeerJS. No ofrece ninguna garantía de funcionamiento. Antes de publicar conviene tener uno propio. [peerjs-server](https://github.com/peers/peerjs-server) se puede alojar gratis en Render o Fly.io.
- Algunas redes móviles bloquean las conexiones directas. Para ellas hace falta un servidor TURN, por ejemplo el plan gratuito de Metered. Si me pasas los datos, los añado al juego.

## 9. Donaciones con Stripe (opcional, solo versión web)

El botón **Apoyar al creador** aparece en la versión web. En la app de iPhone y Android está oculto, porque Apple y Google obligan a usar sus propios pagos dentro de las apps. Mientras no completes estos pasos, el botón explica que las donaciones aún no están activadas y no cobra nada.

Cómo funciona: el juego pide al servidor una página de pago, el jugador paga en la página oficial de Stripe y Stripe avisa al servidor con un mensaje firmado. Solo entonces el juego da las gracias. El juego nunca ve la tarjeta ni las claves secretas.

### Lo que necesitas tú

- **Una cuenta de Stripe a tu nombre** ([stripe.com](https://stripe.com)). Stripe pide ser mayor de edad, tus datos de identidad y una **cuenta bancaria** donde recibir el dinero. Si eres menor de edad, la cuenta tiene que abrirla un adulto responsable. Al registrarte, describe la actividad como un videojuego que acepta apoyo voluntario. Stripe revisa cada cuenta y puede pedirte más datos.
- Stripe cobra una comisión por cada pago. Consulta su página de precios. Pregunta también cómo declarar lo que recibas.

### Pasos

1. **Prueba primero en modo de prueba.** En el panel de Stripe, activa el *modo de prueba* (*Test mode*). Así no se cobra dinero de verdad.
2. **Clave secreta.** En *Developers* y luego *API keys*, copia la **Secret key** (`sk_test_…` en modo de prueba). Es secreta: no la pongas en el juego ni me la pases por el chat. Va solo en Supabase (paso 4).
3. **Subir las dos funciones a Supabase.** En Supabase, ve a *Edge Functions* y crea una función nueva con el editor del navegador:
   - Nombre `crear-donacion`: pega el contenido de [`supabase/functions/crear-donacion/index.ts`](supabase/functions/crear-donacion/index.ts) y pulsa *Deploy*.
   - Nombre `stripe-webhook`: pega [`supabase/functions/stripe-webhook/index.ts`](supabase/functions/stripe-webhook/index.ts) y pulsa *Deploy*.
   - En los ajustes de **las dos**, desactiva **Enforce JWT verification** (*Verify JWT*). La clave publicable del juego no es un JWT, y Stripe no tiene sesión. La seguridad la dan la firma de Stripe y las comprobaciones de dentro.
4. **Avisos de Stripe (webhook).** En Stripe, ve a *Developers* y luego *Webhooks*, y añade un destino:
   - Dirección: `https://gtkuopfkubxxlkvidhlg.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`.
   - Copia el **Signing secret** (`whsec_…`).
5. **Secretos en Supabase.** En *Edge Functions*, entra en *Secrets* y añade:
   - `STRIPE_SECRET_KEY`: la clave del paso 2.
   - `STRIPE_WEBHOOK_SECRET`: el `whsec_…` del paso 4.
   - `ALLOWED_RETURN_URLS`: la dirección de la versión web del juego, por ejemplo `https://marcofergar08-coder.github.io/bosque-de-vapor/`. Si hay más de una, sepáralas con comas. Solo se vuelve a esas direcciones después de pagar.
6. **Probar.** Abre la versión web, pulsa *Apoyar al creador* y paga con la tarjeta de prueba de Stripe `4242 4242 4242 4242`, con cualquier fecha futura y cualquier CVC. Debe salir «¡Muchísimas gracias!». En Supabase, la tabla `donations` debe mostrar la donación como `paid`.
7. **Pasar a real.** Cuando todo funcione, repite los pasos 2, 4 y 5 en el modo real de Stripe (`sk_live_…` y un webhook nuevo con su propio `whsec_…`) y sustituye los dos secretos en Supabase. No hace falta tocar el juego.

Para ver las donaciones, mira la tabla `donations` de Supabase o el panel de Stripe. Si un pago tarda (algunos métodos son lentos), el juego lo explica y no pide volver a pagar.

## Comprobar que todo funciona

Las pruebas automáticas están en [`pruebas/`](pruebas/README.md). Se ejecutan contra una copia local del servidor de cuentas de Supabase y de la base de datos.
