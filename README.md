# Ocean CRM

CRM comercial interno de **Ocean Industries** — la cabina desde donde el equipo opera sus leads, conversa con clientes por WhatsApp y consulta el negocio con IA. Comparte base de datos con **Valeria**, el agente de ventas de WhatsApp, así que todo lo que Valeria conversa y califica aparece aquí en tiempo real.

## Qué hace

- **Panel** — métricas de cartera, embudo de ventas y servicios de mayor interés.
- **Pipeline** — tablero kanban arrastrable de leads por etapa (interactuando → ganado/perdido), con ficha completa de cada cliente (información, conversación, archivos).
- **Conversaciones** — WhatsApp Web propio: ver y responder los chats con clientes desde el CRM. Los mensajes salen por la misma línea de Valeria (Evolution API) y quedan registrados.
- **Inteligencia** — chat con IA conversacional sobre el CRM: "¿qué leads están calientes?", "¿a quién le hago seguimiento?". Responde con datos reales de la base.
- **Seguimientos** — clientes que necesitan atención, priorizados por lead score y días sin contacto.

## Stack

- **Frontend:** React + Vite (estático), sistema de diseño propio "Lima Profunda" (negro + verde lima).
- **Backend:** funciones serverless de Vercel (`/api`), Node.js.
- **Base de datos:** Supabase (PostgreSQL) — compartida con Valeria.
- **WhatsApp:** Evolution API (vía el mismo número comercial de Valeria).
- **IA:** Claude (Anthropic) para el módulo de inteligencia.
- **Auth:** JWT con contraseñas hasheadas (bcrypt).

## Correr en local

```bash
# Frontend
cd frontend
npm install
npm run dev        # http://localhost:5173

# El backend son funciones serverless: se prueban desplegadas en Vercel
# o con `vercel dev` desde la raíz del proyecto.
```

## Variables de entorno

Configurar en Vercel (ver `.env.example` para la lista completa). Nunca subir valores reales al repo.

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | Proyecto Supabase del CRM (`jsohtuinuvbnsqdnjhsc`) |
| `SUPABASE_SERVICE_KEY` | Service role (solo backend) |
| `JWT_SECRET` | Firma de sesiones |
| `ANTHROPIC_API_KEY` | Vista de Inteligencia (chat IA) |
| `EVOLUTION_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE` | Enviar WhatsApp desde el CRM |
| `N8N_CAMPAIGN_WEBHOOK` | Disparar campañas masivas vía Valeria |
| `CORS_ORIGIN` | Dominio del frontend |

## Deploy

Desplegado en Vercel sobre `crm.oceanindustries.com.co`. El frontend se compila desde `frontend/` y las funciones de `/api` corren como serverless en el mismo proyecto. Push a `main` redespliega automáticamente.

---

*Proyecto interno de Ocean Industries. Privado.*
