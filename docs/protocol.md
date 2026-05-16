# Protocolo de comunicación Shell ↔ Sub-app

## Descripción general

La shell y las sub-apps se comunican exclusivamente mediante `postMessage`. No hay estado compartido, ni variables globales, ni almacenamiento común.

Cada sub-app recibe mensajes de la shell y puede enviar mensajes de vuelta. El canal es asíncrono y basado en eventos.

## Mensajes Shell → App

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `auth:token` | `{ token: string, user: { id, email, name, role } }` | Token JWT e información del usuario autenticado |
| `auth:clear` | `null` | Sesión cerrada, la app debe limpiar estado |
| `theme` | `{ mode: 'light' \| 'dark', variables?: object }` | Cambio de tema visual |
| `navigate` | `{ path: string }` | Solicitud de navegación a una ruta específica |
| `shell:ready` | `null` | La shell ha terminado de inicializarse |

## Mensajes App → Shell

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `app:ready` | `null` | La app se ha inicializado y está lista para recibir mensajes |
| `auth:request` | `null` | La app solicita el token de autenticación actual |
| `navigate` | `{ path: string }` | La app solicita navegar a otra ruta (cross-app) |
| `resize` | `{ height: number }` | La app reporta su altura actual para ajustar el iframe |
| `notify` | `{ type: string, message: string, duration?: number }` | La app solicita mostrar una notificación |

## Comunicación cross-app (futuro)

Para comunicación entre sub-apps, toda la comunicación pasa por la shell como intermediario:

1. App A emite: `{ type: 'event:emit', payload: { channel: 'item-selected', data: {...} } }`
2. Shell recibe, decide si reenvía a otras apps
3. Shell reenvía a App B: `{ type: 'event:receive', payload: { channel: 'item-selected', data: {...} } }`

## Implementación

### En la sub-app (JS/TS):

```typescript
import { ShellClient } from '@plataforma/shell-protocol';

const client = new ShellClient('mi-app-id');

client.onToken = (token, user) => {
  // Guardar token, inicializar API client
};

client.onTheme = (mode) => {
  document.documentElement.setAttribute('data-theme', mode);
};

// Reportar altura para el iframe
client.reportHeight(document.body.scrollHeight);

// Navegar a otra app
client.navigate('/dashboard');

// Mostrar notificación
client.notify('success', 'Operación completada');

// Limpiar al desmontar
client.destroy();
```

### En la shell:

```typescript
import { listen, sendMessage } from '@plataforma/shell-protocol';

// Escuchar mensajes de apps
listen((event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'app:ready':
      sendMessage(event.source, { type: 'auth:token', payload: { token } });
      break;
    case 'navigate':
      // Manejar navegación
      break;
  }
});
```
