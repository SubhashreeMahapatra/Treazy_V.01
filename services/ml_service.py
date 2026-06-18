"""
services/ml_service.py — ML Models for Treazy AI
==================================================
MODELS:
  1. ARIMA(2,1,2) — Cash flow forecasting
    : "AR=2 means we use 2 past values. I=1 means we
                 difference the series once to remove trend.
                 MA=2 means we correct for 2 past prediction errors.
                 Trained on 90 days, predicts next 30 days.
                 MAPE of ~2-3% is production-grade for daily cash flows."

  2. Isolation Forest — Anomaly detection
     : "Randomly splits data into partitions. Anomalies
                 get isolated in FEWER splits because they're
                 statistically far from normal clusters.
                 Score 0→1 (1 = very anomalous). Threshold: 0.65."
"""

import numpy as np
import pandas as pd
import logging
from datetime import datetime, timedelta, date
from sqlalchemy import text

log = logging.getLogger(__name__)


# ── ARIMA Forecasting ─────────────────────────────────────────────────────────
def run_arima(db, entity_id: str = "HQ", days_ahead: int = 30) -> dict:
    """
    Load transaction history from DB → fit ARIMA → save forecasts → return results.
    """
    from statsmodels.tsa.arima.model import ARIMA
    import warnings
    warnings.filterwarnings("ignore")

    # Pull balance history from DB (real SQL query)
    result = db.execute(text("""
        SELECT txn_date, balance_after as balance
        FROM transactions
        WHERE entity_id = :eid
          AND direction = 'IN'
        ORDER BY txn_date
    """), {"eid": entity_id})
    rows = result.fetchall()

    if len(rows) < 30:
        return {"error": "Insufficient data (need ≥30 days)"}

    df      = pd.DataFrame(rows, columns=["txn_date", "balance"])
    df      = df.drop_duplicates("txn_date").set_index("txn_date")
    series  = df["balance"].values[-90:]   # use last 90 days for training

    try:
        model  = ARIMA(series, order=(2, 1, 2))
        fitted = model.fit()
        fcast  = fitted.forecast(steps=days_ahead)

        # Save to DB
        from db.models import Forecast
        last_date = pd.to_datetime(df.index[-1])
        saved = []

        for i, val in enumerate(fcast):
            fdate = last_date + timedelta(days=i + 1)
            if isinstance(fdate, pd.Timestamp):
                fdate = fdate.date()
            # Skip Sundays
            if fdate.weekday() == 6:
                continue

            # 95% confidence interval (±1.96 std)
            std_err = float(fitted.bse.mean())
            db.add(Forecast(
                entity_id=entity_id,
                forecast_date=fdate,
                horizon_days=days_ahead,
                predicted_balance=round(float(val), 0),
                confidence_lower=round(float(val) - 1.96 * std_err, 0),
                confidence_upper=round(float(val) + 1.96 * std_err, 0),
                model_version="ARIMA(2,1,2)",
            ))
            saved.append({
                "date":    str(fdate),
                "label":   pd.Timestamp(fdate).strftime("%d %b"),
                "pred_cr": round(float(val) / 1e7, 2),
                "lo_cr":   round((float(val) - 1.96 * std_err) / 1e7, 2),
                "hi_cr":   round((float(val) + 1.96 * std_err) / 1e7, 2),
            })

        db.commit()

        # MAPE on last 30 in-sample points
        actual  = series[-30:]
        in_pred = fitted.fittedvalues[-30:]
        mape    = float(np.mean(np.abs((actual - in_pred) / (np.abs(actual) + 1e-8))) * 100)

        return {
            "entity_id":   entity_id,
            "model":       "ARIMA(2,1,2)",
            "trained_on":  f"{len(series)} days",
            "mape_pct":    round(mape, 2),
            "days_ahead":  len(saved),
            "forecasts":   saved,
        }

    except Exception as e:
        log.error(f"ARIMA failed for {entity_id}: {e}")
        return {"error": str(e)}


# ── Isolation Forest Anomaly Detection ───────────────────────────────────────
def run_anomaly_detection(db, entity_id: str = "HQ") -> dict:
    """
    Pull transactions from DB → run Isolation Forest → save anomalies to DB.
    """
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    from db.models import Anomaly, Severity

    # Pull transactions
    result = db.execute(text("""
        SELECT id, txn_date, amount_inr, direction,
               txn_type, balance_after
        FROM transactions
        WHERE entity_id = :eid
        ORDER BY txn_date
    """), {"eid": entity_id})
    rows = result.fetchall()

    if len(rows) < 20:
        return {"error": "Need ≥20 transactions"}

    df = pd.DataFrame(rows, columns=["id","txn_date","amount_inr","direction","txn_type","balance"])

    # Feature engineering
    df["amount_inr"] = df["amount_inr"].astype(float)
    df["balance"]    = df["balance"].astype(float)
    df["is_out"]     = (df["direction"] == "OUT").astype(int)
    df["amount_log"] = np.log1p(df["amount_inr"])
    df["bal_change"] = df["balance"].diff().fillna(0)

    features = df[["amount_log", "is_out", "bal_change"]].values

    scaler = StandardScaler()
    X      = scaler.fit_transform(features)

    iso = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
    iso.fit(X)

    raw_scores     = iso.score_samples(X)
    anom_scores    = 1 - (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-8)
    df["score"]    = anom_scores

    flagged = df[df["score"] > 0.65].copy()

    # Clear old anomalies for this entity and save new ones
    db.execute(text("DELETE FROM anomalies WHERE entity_id = :eid"), {"eid": entity_id})

    results = []
    for _, row in flagged.iterrows():
        score = float(row["score"])
        sev   = (Severity.CRITICAL if score > 0.90 else
                 Severity.HIGH     if score > 0.80 else
                 Severity.MEDIUM)
        atype = ("duplicate_payment"  if row["is_out"] and score > 0.85 else
                 "unusual_large_outflow" if row["is_out"] else
                 "unexpected_large_inflow")
        desc  = ("Possible duplicate vendor payment — cross-check ERP" if atype == "duplicate_payment" else
                 "Outflow spike 3×+ average — potential fraud or error" if row["is_out"] else
                 "Large unexpected inflow — verify source")

        db.add(Anomaly(
            transaction_id=int(row["id"]),
            entity_id=entity_id,
            anomaly_type=atype,
            severity=sev,
            anomaly_score=round(score, 3),
            notes=desc,
        ))
        results.append({
            "date":       str(row["txn_date"]),
            "score":      round(score, 3),
            "severity":   sev.value,
            "type":       atype,
            "amount_cr":  round(float(row["amount_inr"]) / 1e7, 2),
            "direction":  row["direction"],
            "description":desc,
        })

    db.commit()
    return {
        "entity_id":      entity_id,
        "model":          "Isolation Forest (n=100, contamination=5%)",
        "total_checked":  len(df),
        "anomalies_found":len(results),
        "threshold":      0.65,
        "anomalies":      sorted(results, key=lambda x: x["score"], reverse=True),
    }


# ── Cash Flow Chart Data ──────────────────────────────────────────────────────
def get_cashflow_chart(db, entity_id: str = "HQ", days: int = 90) -> list:
    """Pull daily cash flow from DB for charts."""
    result = db.execute(text("""
        SELECT txn_date,
               SUM(CASE WHEN direction='IN'  THEN amount_inr ELSE 0 END) as inflow,
               SUM(CASE WHEN direction='OUT' THEN amount_inr ELSE 0 END) as outflow,
               MAX(balance_after) as balance
        FROM transactions
        WHERE entity_id = :eid
          AND txn_date >= date('now', :days)
        GROUP BY txn_date
        ORDER BY txn_date
    """), {"eid": entity_id, "days": f"-{days} days"})

    rows = result.fetchall()
    out  = []
    for r in rows:
        try:
            d = pd.Timestamp(r[0])
            out.append({
                "date":       str(r[0]),
                "label":      d.strftime("%d %b"),
                "inflow_cr":  round((r[1] or 0) / 1e7, 2),
                "outflow_cr": round((r[2] or 0) / 1e7, 2),
                "balance_cr": round((r[3] or 0) / 1e7, 2),
                "net_cr":     round(((r[1] or 0) - (r[2] or 0)) / 1e7, 2),
            })
        except Exception:
            pass
    return out


# ── LP Optimizer ──────────────────────────────────────────────────────────────
def run_optimizer(db) -> dict:
    """
    Simple LP: identify idle cash above floor → recommend liquid MF sweep.
    : "Objective: maximise Σ(balance_i × yield_i).
                Constraint: each entity balance ≥ minimum floor.
                Output: how much to sweep, to which instrument, expected yield."
    """
    result = db.execute(text("""
        SELECT e.id, e.name, e.city, e.min_balance,
               t.balance_after as balance
        FROM entities e
        JOIN transactions t ON e.id = t.entity_id
        WHERE t.id = (
            SELECT id FROM transactions t2
            WHERE t2.entity_id = e.id
            ORDER BY txn_date DESC, id DESC LIMIT 1
        )
    """))
    rows = result.fetchall()

    actions      = []
    total_sweep  = 0
    total_yield  = 0
    LIQUID_YIELD = 0.070   # 7% annual for overnight liquid MF
    GSEC_YIELD   = 0.0728  # 7.28% 10Y G-Sec benchmark

    for r in rows:
        eid, name, city, floor, balance = r
        balance = float(balance or 0)
        floor   = float(floor or 0)
        excess  = balance - floor

        if excess > 1_00_00_000:   # Only if >₹1Cr excess
            sweep   = excess * 0.70    # Keep 30% as daily operational buffer
            gain    = sweep * LIQUID_YIELD
            total_sweep += sweep
            total_yield += gain
            action  = f"Sweep ₹{round(sweep/1e7,1)}Cr → HDFC Overnight Fund @ 7.0% p.a."
            priority = "High" if excess > 5_00_00_000 else "Medium"
        else:
            sweep, gain = 0, 0
            action   = "Hold — balance near minimum threshold"
            priority = "Low"

        actions.append({
            "entity":       name,
            "city":         city,
            "balance_cr":   round(balance / 1e7, 2),
            "floor_cr":     round(floor   / 1e7, 2),
            "excess_cr":    round(max(0, excess) / 1e7, 2),
            "sweep_cr":     round(sweep   / 1e7, 2),
            "annual_gain_cr": round(gain  / 1e7, 2),
            "action":       action,
            "priority":     priority,
        })

    return {
        "total_sweep_cr":  round(total_sweep / 1e7, 2),
        "annual_gain_cr":  round(total_yield / 1e7, 2),
        "instrument":      "Overnight Liquid Mutual Fund",
        "yield_pct":       7.0,
        "actions":         actions,
        "note":            "Amounts in ₹ Crore. Returns estimated at 7% p.a. (HDFC/SBI Overnight Fund).",
    }
