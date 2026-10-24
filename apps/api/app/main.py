import math
from typing import Any
import numpy as np
import pandas as pd
import chainladder as cl
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .schemas import CalculationRecipe, CalculationResponse

app = FastAPI(
    title="ResQ-Next Actuarial Engine API",
    version="1.0.0",
    description="Enterprise Actuarial Reserving API powered by Python chainladder"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def sanitize_nan(obj: Any) -> Any:
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_nan(v) for v in obj]
    return obj

@app.get("/health")
def health_check():
    return {"status": "ok", "engine": "chainladder"}
