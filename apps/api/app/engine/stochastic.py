"""
Stochastic Actuarial Reserving Engine using Python chainladder
Supports:
- MackChainladder (Distribution-free standard error of reserve estimates)
- BootstrapODPSample (Over-dispersed Poisson Bootstrap with n_sims=5000)
"""
from typing import Dict, Any
import numpy as np
import chainladder as cl

def run_mack_chainladder(dev_tri: cl.Triangle) -> Dict[str, Dict[str, float]]:
    mack = cl.MackChainladder().fit(dev_tri)
    origins = [str(o)[:4] for o in dev_tri.origin]
    se_vals = mack.mack_std_err_.values[0, 0, :, -1]
    ibnr_vals = mack.ibnr_.values[0, 0, :, -1]

    std_error = {}
    cv = {}
    for i, orig in enumerate(origins):
        se = float(0.0 if np.isnan(se_vals[i]) else se_vals[i])
        ibnr = float(0.0 if np.isnan(ibnr_vals[i]) else ibnr_vals[i])
        std_error[orig] = round(se, 2)
        cv[orig] = round((se / ibnr) if ibnr > 0 else 0.0, 4)

    return {"mack_std_error": std_error, "mack_cv": cv}

def run_odp_bootstrap(tri: cl.Triangle, n_sims: int = 5000, random_state: int = 42) -> Dict[str, Any]:
    samples = cl.BootstrapODPSample(n_sims=n_sims, random_state=random_state).fit_transform(tri)
    pipe = cl.Chainladder().fit(cl.Development().fit_transform(samples))
    sim_totals = pipe.ibnr_.sum("origin").values[:, 0, 0, -1]
    sim_totals = sim_totals[~np.isnan(sim_totals)]

    return {
        "n_sims": n_sims,
        "mean_ibnr": float(np.mean(sim_totals)),
        "std_dev": float(np.std(sim_totals)),
        "p50": float(np.percentile(sim_totals, 50)),
        "p75": float(np.percentile(sim_totals, 75)),
        "p95": float(np.percentile(sim_totals, 95)),
        "p99_5": float(np.percentile(sim_totals, 99.5)),
    }
