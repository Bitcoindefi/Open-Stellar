# Stellar Track 8004 Fallback

En este repositorio, cuando el track 8004 no esta disponible en Stellar, se usa un sistema de reputacion como fallback operativo.

## Regla

- Si chain = stellar y no hay soporte de 8004, el sistema resuelve modo reputation-fallback.
- Cada actor inicia con score 500.
- El score se actualiza por acciones positivas o negativas.
- El score se limita entre 0 y 1000.

## Endpoints

- GET /api/protocol/track8004?chain=stellar
- GET /api/protocol/reputation?actorId=<id>
- POST /api/protocol/reputation

## Ejemplo de actualizacion

Payload:

{
"actorId": "agent-7",
"delta": 25,
"reason": "successful escrow release",
"scope": "tx"
}
