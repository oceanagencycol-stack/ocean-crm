# 🌊 Ocean CRM — Guía de despliegue en Vercel

CRM comercial para Ocean Industries. Frontend React + backend serverless, todo en **un solo proyecto de Vercel** conectado a tu Supabase.

Esta arquitectura elimina los problemas que tuvimos con Easypanel: no hay servidor que se caiga, las variables de entorno funcionan directo, y cada cambio se despliega solo.

---

## Cómo funciona

```
┌──────────────────────── UN SOLO PROYECTO VERCEL ────────────────────────┐
│                                                                          │
│   Frontend React (Vite)  ────interno────▶  /api/* (serverless)           │
│   crm.oceanindustries.com.co               mismas funciones, mismo dominio│
│                                                    │                      │
└────────────────────────────────────────────────────┼──────────────────────┘
                                                       ▼
                                          Supabase (sfcuhzrdlplvxjacjrdc)
                                          tablas: usuarios, clientes
```

**Seguridad:** la `service_role` de Supabase vive SOLO en las variables de entorno del backend en Vercel. Nunca llega al navegador.

---

## PASO 1 — Subir el código a GitHub

El proyecto está pensado para desplegarse desde GitHub (así cada cambio se actualiza solo).

1. Descomprime `ocean-crm.zip`
2. Crea un repositorio nuevo en tu organización `oceanagencycol-stack` (por ejemplo, `ocean-crm`)
3. Sube el contenido de la carpeta `ocean-crm/` a ese repo

Si prefieres no usar Git, en el PASO 2 puedes arrastrar la carpeta directamente a Vercel.

---

## PASO 2 — Crear el proyecto en Vercel

1. Entra a [vercel.com](https://vercel.com) → **Add New → Project**
2. Importa el repositorio `ocean-crm` (o arrastra la carpeta)
3. Vercel detectará la configuración desde `vercel.json` automáticamente. **No cambies el framework preset** — déjalo en "Other", el `vercel.json` ya define todo.
4. **NO le des Deploy todavía.** Primero configura las variables (PASO 3).

---

## PASO 3 — Configurar las variables de entorno

En la pantalla de configuración del proyecto (antes de desplegar), o en **Settings → Environment Variables**, agrega estas seis:

| Variable | Valor |
|----------|-------|
| `SUPABASE_URL` | `https://sfcuhzrdlplvxjacjrdc.supabase.co` |
| `SUPABASE_SERVICE_KEY` | *(tu service_role key de Supabase)* |
| `JWT_SECRET` | *(genera uno: ver abajo)* |
| `N8N_CAMPAIGN_WEBHOOK` | `https://ocean-n8n.hj1tdk.easypanel.host/webhook/campana-masiva` |
| `CORS_ORIGIN` | `https://crm.oceanindustries.com.co` |
| `VITE_API_URL` | `https://crm.oceanindustries.com.co` |

**Para generar el `JWT_SECRET`**, corre en tu terminal:
```bash
openssl rand -base64 48
```
Copia el resultado y pégalo como valor.

**Importante sobre `CORS_ORIGIN` y `VITE_API_URL`:** ambos deben ser el dominio final del proyecto. Como el frontend y el backend viven en el MISMO proyecto Vercel, apuntan al mismo dominio. Si por ahora no tienes el dominio configurado, usa primero la URL que Vercel te asigna (algo como `ocean-crm-xxx.vercel.app`) en ambas variables, y luego las actualizas cuando conectes el dominio (PASO 5).

---

## PASO 4 — Desplegar

Dale **Deploy**. Vercel va a:
1. Instalar dependencias del backend
2. Compilar el frontend (`npm run build`)
3. Publicar las funciones `/api/*`

Tarda 1-2 minutos. Cuando termine, verifica que el backend vive entrando a:
```
https://[tu-proyecto].vercel.app/api/health
```
Debe responder: `{"status":"ok","service":"ocean-crm-api",...}`

Si eso responde, **el sistema está vivo.**

---

## PASO 5 — Conectar tu dominio (crm.oceanindustries.com.co)

1. En Vercel → **Settings → Domains** → agrega `crm.oceanindustries.com.co`
2. Vercel te dará un registro DNS (normalmente un CNAME)
3. En GoDaddy → DNS, agrega ese registro

   **OJO:** ya tienes un registro `A` para `crm` apuntando a `178.156.183.173` (tu viejo intento en Hetzner). **Bórralo** y reemplázalo por el CNAME que te da Vercel. Si no, el dominio seguirá apuntando al servidor viejo.
4. Una vez conectado, vuelve a **Settings → Environment Variables** y confirma que `CORS_ORIGIN` y `VITE_API_URL` usen `https://crm.oceanindustries.com.co`
5. **Redespliega** (Deployments → ⋯ → Redeploy) para que el frontend tome la URL correcta del dominio

---

## PASO 6 — Entrar al CRM

Ve a `https://crm.oceanindustries.com.co` y entra con:
- **Correo:** juan@oceanindustries.com.co
- **Contraseña:** *(la que ya configuraste)*

Tu usuario ya existe en la base de datos con rol `owner`, así que tienes acceso total.

---

## Lo que ya funciona

- **Panel:** métricas del pipeline (clientes totales, leads calientes, valor del pipeline, distribución por etapa)
- **Pipeline Kanban:** 7 etapas (Nuevo → Contactado → Calificado → Propuesta → Negociación → Ganado/Perdido). Clic en una tarjeta para ver detalles y mover de etapa.
- **Nuevo cliente:** formulario para agregar clientes manualmente
- **Campañas:** envío de mensajes masivos por WhatsApp a través de Valeria (n8n)

---

## Problemas comunes

| Problema | Solución |
|----------|----------|
| `/api/health` da error | Revisa que las 6 variables estén bien escritas en Vercel y redespliega |
| Login dice "No autorizado" | Verifica `JWT_SECRET` configurado y que tu usuario tenga contraseña |
| Login no carga / error de red | `VITE_API_URL` debe ser el dominio exacto; redespliega después de cambiarlo |
| El dominio muestra el 404 viejo | Borra el registro `A` de `crm` en GoDaddy y deja solo el CNAME de Vercel |
| Pipeline vacío | Normal al inicio. Se llena cuando Valeria capture leads o agregues clientes |

---

## Estructura del proyecto

```
ocean-crm/
├── vercel.json            # Configuración de Vercel (build + rutas)
├── package.json           # Dependencias del backend
├── .env.example           # Plantilla de variables (referencia)
├── api/
│   ├── [...path].js       # Todas las rutas del backend (login, clientes, dashboard, campañas)
│   └── _lib.js            # Utilidades (Supabase, JWT, CORS)
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx        # Toda la interfaz (login, panel, pipeline, campañas)
        ├── api.js         # Cliente que habla con el backend
        ├── styles.css     # Diseño oceánico
        └── main.jsx
```

---

🌊 **Ocean CRM** — Construido para Ocean Industries
