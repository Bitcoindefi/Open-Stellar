"""Optional local Laya evaluator for Open Stellar.

Run with: python scripts/laya-sidecar.py
The service binds to loopback only and is intended for typed decisions, not chat generation.
"""
import os
import threading

from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
import laya

app = FastAPI(title="Open Stellar Laya sidecar")
agent = laya.load(os.getenv("LAYA_CHECKPOINT", "convaiinnovations/laya"))
lock = threading.Lock()


class Prediction(BaseModel):
    state: str
    questions: dict
    lang: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "engine": "laya", "localOnly": True}


@app.post("/predict")
def predict(body: Prediction):
    with lock:
        result = agent.predict(body.state, body.questions, lang=body.lang)
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("LAYA_PORT", "8788")))
