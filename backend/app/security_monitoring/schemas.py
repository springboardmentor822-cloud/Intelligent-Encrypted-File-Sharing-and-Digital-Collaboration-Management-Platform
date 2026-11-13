from pydantic import BaseModel


class SecurityOverview(BaseModel):
    totals: dict
    alerts_by_severity: dict
    alerts_series: list[dict]
    recent_alerts: list[dict]
    recent_events: list[dict]


class RuleOut(BaseModel):
    id: str
    label: str
    threshold: int
    window_minutes: int
    severity: str
    description: str
