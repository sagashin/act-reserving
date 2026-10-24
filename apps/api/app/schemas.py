from pydantic import BaseModel
from typing import List, Dict, Optional, Literal, Tuple

class DevelopmentConfig(BaseModel):
    average: Literal["volume", "simple", "regression", "last_3_volume", "last_5_volume"] = "volume"
    n_periods: int = -1  # -1は全期間、3なら直近3期間、5なら直近5期間
    drop_cells: List[Tuple[str, int]] = []  # 除外するセル座標 例: [("2021", 12), ("2022", 24)]
    manual_ldf_overrides: Dict[int, float] = {}  # 開発期間ごとの手動LDF上書き 例: {12: 1.45, 24: 1.12}

class TailConfig(BaseModel):
    method: Literal["none", "constant", "curve"] = "none"
    tail_factor: float = 1.0  # constantの場合の手入力値
    curve_type: Literal["exponential", "inverse_power"] = "exponential"
    extrap_periods: int = 5

class MethodWeight(BaseModel):
    paid_cl: float = 0.0
    incurred_cl: float = 0.0
    paid_bf: float = 0.0
    incurred_bf: float = 0.0
    cape_cod: float = 0.0

class CalculationRecipe(BaseModel):
    lob_id: str
    paid_dev: DevelopmentConfig
    incurred_dev: DevelopmentConfig
    paid_tail: TailConfig
    incurred_tail: TailConfig
    apriori_loss_ratio: Dict[str, float]  # BF法用の事前期待損害率 {"2020": 0.65, ...}
    origin_method_weights: Dict[str, MethodWeight]  # 事故年度別の手法ブレンド比率

class CalculationResponse(BaseModel):
    origins: List[str]
    developments: List[int]
    paid_triangle: List[List[Optional[float]]]
    incurred_triangle: List[List[Optional[float]]]
    paid_link_ratios: List[List[Optional[float]]]
    incurred_link_ratios: List[List[Optional[float]]]
    paid_ldfs_by_period: Dict[str, List[float]]
    incurred_ldfs_by_period: Dict[str, List[float]]
    paid_cdf: List[float]
    incurred_cdf: List[float]
    ultimates_by_method: Dict[str, Dict[str, float]]
    selected_ultimate: Dict[str, float]
    selected_ibnr: Dict[str, float]
    mack_std_error: Optional[Dict[str, float]] = None
    mack_cv: Optional[Dict[str, float]] = None
