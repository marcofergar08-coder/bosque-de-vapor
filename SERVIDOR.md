# Conectar el servidor (Supabase)

Las cuentas, el progreso en la nube, los amigos, los grupos, el emparejamiento y la clasificación mundial usan **Supabase**. Su plan gratuito es suficiente para empezar. Mientras no lo conectes, el juego funciona igual que antes y no se conecta a nada.

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

## Comprobar que todo funciona

Las pruebas automáticas están en [`pruebas/`](pruebas/README.md). Se ejecutan contra una copia local del servidor de cuentas de Supabase y de la base de datos.
