"""
Deterministic Actuarial Reserving Engine using Python chainladder
Supports:
- Volume-weighted, Simple, Regression, Last-3, Last-5 LDFs
- Cell coordinate outlier exclusion (drop_cells)
- Manual LDF overrides & CDF recomputation
- TailConstant & TailCurve (Exponential, Inverse Power)
- Chainladder, Bornhuetter-Ferguson, and Cape Cod Ultimates
"""
from typing import Dict, List, Tuple
import numpy as np
import chainladder as cl
from ..schemas import CalculationRecipe, DevelopmentConfig, TailConfig

def build_development_pipe(tri: cl.Triangle, dev_cfg: DevelopmentConfig, tail_cfg: TailConfig) -> cl.Triangle:
    drop_list = [(str(origin), int(dev)) for origin, dev in dev_cfg.drop_cells] if dev_cfg.drop_cells else None
    avg_mode = "volume" if dev_cfg.average in ("volume", "last_3_volume", "last_5_volume") else dev_cfg.average
    n_per = 3 if dev_cfg.average == "last_3_volume" else (5 if dev_cfg.average == "last_5_volume" else dev_cfg.n_periods)

    dev = cl.Development(average=avg_mode, n_periods=n_per, drop=drop_list).fit_transform(tri)

    # Apply manual LDF overrides if provided
    if dev_cfg.manual_ldf_overrides:
        devs = list(tri.development[:-1])
        ldf_vals = dev.ldf_.values.copy()
        for idx, d in enumerate(devs):
            if int(d) in dev_cfg.manual_ldf_overrides:
                ldf_vals[..., idx] = float(dev_cfg.manual_ldf_overrides[int(d)])
        dev.ldf_.values = ldf_vals

    # Apply Tail Factor
    if tail_cfg.method == "constant" and tail_cfg.tail_factor > 1.0:
        dev = cl.TailConstant(tail=tail_cfg.tail_factor).fit_transform(dev)
    elif tail_cfg.method == "curve":
        dev = cl.TailCurve(curve=tail_cfg.curve_type, extrap_periods=tail_cfg.extrap_periods).fit_transform(dev)

    return dev
