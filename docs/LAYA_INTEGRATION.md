# Laya en Open Stellar

Laya es un evaluador local de decisiones tipadas. Se usa para clasificación, routing, riesgo, readiness y guardrails; no genera respuestas de chat ni reemplaza a JEV.

Open Stellar se conecta a un sidecar Python por `OPEN_STELLAR_LAYA_URL`. El sidecar escucha en loopback (`127.0.0.1`) y carga el modelo una sola vez. Si Laya no está disponible, los flujos que necesiten evaluación remota pueden seguir usando JEV con la clave BYOK del usuario.

## Desarrollo local

```bash
python -m pip install laya fastapi uvicorn
export OPEN_STELLAR_LAYA_URL=http://127.0.0.1:8788
python scripts/laya-sidecar.py
```

El endpoint protegido `POST /api/ai/laya/evaluate` recibe `state`, `questions` y opcionalmente `lang`. `GET /api/admin/jev` expone el estado de Laya sin revelar secretos.

El modelo descarga sus pesos la primera vez. Configura umbrales y una ruta de escalado para respuestas con baja confianza antes de usarlo en producción; valida precisión y calibración con datos propios.
