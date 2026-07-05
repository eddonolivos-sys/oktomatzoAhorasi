# Audio de Ramatzo

Este directorio se sirve tal cual en `/audio/` (dev: Vite `publicDir`; prod:
`dist` → nginx → Caddy). No hace falta tocar `vite.config.ts` ni el deploy
para reemplazar ningún archivo — solo sustituirlo y redesplegar el shell.

Si un archivo no existe, el sistema de audio lo ignora silenciosamente (no
rompe la app): son todos opcionales.

## Estructura

```
audio/
  ambient.ogg          # música ambiental global, en loop
  sfx/
    thruster.ogg       # propulsor (loop corto; su volumen sube con la velocidad)
    nitro.ogg          # nitro (loop corto; suena mientras Shift está activo)
    collision.ogg       # colisión (un disparo; se conectará de verdad en el Hito 5)
  projects/
    <appId>.ogg        # audio ambiental opcional al entrar en la cabina de un proyecto
                        # <appId> es el id del registro de apps (p.ej. dashboard.ogg)
```

## Cómo reemplazar la música

1. Sustituye el archivo (mismo nombre, mismo sitio) por tu propio `.ogg`.
2. Redespliega el shell: `deploy\ejec-shell.bat` (Windows) o `deploy/ejec-shell.sh` (VPS).
3. Recarga con Ctrl+F5 en `http://localhost:8080` (o el dominio del VPS).

Formato recomendado: Ogg Vorbis, para compatibilidad amplia sin licencias.
