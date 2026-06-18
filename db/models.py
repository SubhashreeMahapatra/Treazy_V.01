"""
db/models.py — SQLAlchemy ORM models for Treazy AI
====================================================
SCHEMA DESIGN:
  "I designed a full relational schema matching real Indian treasury
   operations. The same schema works on SQLite (local demo) or
   MySQL Workbench (production). You just change the connection URL
   in .env — zero code changes needed."

TABLES:
  entities          → 5 Indian company branches (Mumbai HQ, Bengaluru, Delhi, Kolkata, Chennai)
  transactions      → Every cash inflow/outflow with GST/salary/advance-tax labels
  forecasts         → ARIMA predictions stored for audit trail
  anomalies         → Isolation Forest flags with severity
  market_data       → Live USD/INR, NSE, RBI repo from free APIs
  regulatory_ratios → CRR, SLR, LCR compliance (Indian banking norms)
  fx_exposures      → Foreign currency positions with hedge ratios
  portfolios        → Investment portfolio (G-Secs, T-Bills, Liquid MFs)
  agent_runs        → Every CrewAI analysis run logged here
"""

from sqlalchemy import (
    Column, String, Float, Integer, Boolean,
    DateTime, Text, Enum, ForeignKey, Date, JSON
)
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func
import enum

Base = declarative_base()


# ── Enums ──────────────────────────────────────────────────────────────────────
class RiskLevel(str, enum.Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"

class Severity(str, enum.Enum):
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"

class AgentStatus(str, enum.Enum):
    PENDING   = "pending"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"


# ── Table 1: Business entities ────────────────────────────────────────────────
class Entity(Base):
    """
    Indian business units / company branches.
    : 'Like SAP company codes — each entity has its own
              bank accounts, P&L, and liquidity requirements.'
    """
    __tablename__ = "entities"

    id          = Column(String(10), primary_key=True)      # e.g. "HQ", "MUM", "BLR"
    name        = Column(String(100), nullable=False)
    city        = Column(String(50))
    entity_type = Column(String(30), default="subsidiary")  # HQ / subsidiary / branch
    currency    = Column(String(3), default="INR")
    min_balance = Column(Float, default=0)                  # Minimum cash floor in INR
    risk_level  = Column(Enum(RiskLevel), default=RiskLevel.MEDIUM)
    gst_number  = Column(String(15))
    pan_number  = Column(String(10))
    ifsc_code   = Column(String(11))
    bank_account= Column(String(18))
    bank_name   = Column(String(50))
    created_at  = Column(DateTime, server_default=func.now())

    transactions = relationship("Transaction", back_populates="entity")
    forecasts    = relationship("Forecast", back_populates="entity")
    anomalies_rel= relationship("Anomaly", back_populates="entity")


# ── Table 2: Transactions ─────────────────────────────────────────────────────
class Transaction(Base):
    """
    Every cash event — inflow or outflow.
    : 'This is the core table. Every row is one cash event.
              txn_type labels it: salary, gst_payment, advance_tax,
              vendor_payment, customer_receipt, interco_transfer etc.
              We store raw INR amounts — no currency conversion needed
              for domestic transactions.'
    """
    __tablename__ = "transactions"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    entity_id     = Column(String(10), ForeignKey("entities.id"))
    txn_date      = Column(Date, nullable=False, index=True)
    txn_type      = Column(String(30), index=True)      # salary, gst, vendor, etc.
    direction     = Column(String(3))                    # "IN" or "OUT"
    amount_inr    = Column(Float, nullable=False)
    balance_after = Column(Float)
    description   = Column(String(255))
    reference_no  = Column(String(50))
    is_anomaly    = Column(Boolean, default=False)
    source_system = Column(String(30), default="manual")  # tally, sap, bank_api
    created_at    = Column(DateTime, server_default=func.now())

    entity    = relationship("Entity", back_populates="transactions")
    anomalies = relationship("Anomaly", back_populates="transaction")


# ── Table 3: ML Forecasts ─────────────────────────────────────────────────────
class Forecast(Base):
    """
    ARIMA predictions stored for audit trail.
    : 'Every time ARIMA runs, we save the prediction here.
              This lets us track model accuracy over time —
              compare predicted_balance vs actual when the day arrives.'
    """
    __tablename__ = "forecasts"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    entity_id        = Column(String(10), ForeignKey("entities.id"))
    forecast_date    = Column(Date, nullable=False)
    horizon_days     = Column(Integer, default=30)
    predicted_balance= Column(Float)
    predicted_inflow = Column(Float)
    predicted_outflow= Column(Float)
    actual_balance   = Column(Float)    # filled in after the date passes
    mape             = Column(Float)    # model accuracy (lower = better)
    model_version    = Column(String(20), default="ARIMA(2,1,2)")
    confidence_lower = Column(Float)
    confidence_upper = Column(Float)
    created_at       = Column(DateTime, server_default=func.now())

    entity = relationship("Entity", back_populates="forecasts")


# ── Table 4: Anomalies ────────────────────────────────────────────────────────
class Anomaly(Base):
    """
    Isolation Forest flags.
    : 'When the ML model scores a transaction above 0.65,
              it creates a row here. Treasury team investigates and
              marks is_resolved=True with their findings in notes.'
    """
    __tablename__ = "anomalies"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    entity_id      = Column(String(10), ForeignKey("entities.id"))
    anomaly_type   = Column(String(50))    # duplicate_payment, unusual_outflow, etc.
    severity       = Column(Enum(Severity), default=Severity.MEDIUM)
    anomaly_score  = Column(Float)         # 0-1 (higher = more anomalous)
    detected_at    = Column(DateTime, server_default=func.now())
    is_resolved    = Column(Boolean, default=False)
    resolved_by    = Column(String(50))
    notes          = Column(Text)

    transaction = relationship("Transaction", back_populates="anomalies")
    entity      = relationship("Entity", back_populates="anomalies_rel")


# ── Table 5: Market Data ──────────────────────────────────────────────────────
class MarketData(Base):
    """
    Live data from free APIs — stored so ML models can use historical rates.
    : 'We fetch USD/INR from ExchangeRate-API every hour,
              NSE Nifty from yfinance, RBI repo rate from RBI DBIE.
              All free. All real. All stored here for the ARIMA model
              to use as exogenous variables.'
    """
    __tablename__ = "market_data"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    data_type  = Column(String(20), index=True)  # forex / equity / macro
    ticker     = Column(String(20))              # USDINR=X, ^NSEI, REPO_RATE
    price      = Column(Float)
    change_pct = Column(Float)
    high_24h   = Column(Float)
    low_24h    = Column(Float)
    source     = Column(String(50))
    fetched_at = Column(DateTime, server_default=func.now(), index=True)


# ── Table 6: Regulatory Ratios ────────────────────────────────────────────────
class RegulatoryRatio(Base):
    """
    RBI mandated ratios for bank entities.
    : 'CRR = Cash Reserve Ratio (4.5% of deposits must be with RBI).
              SLR = Statutory Liquidity Ratio (18% in govt securities).
              LCR = Liquidity Coverage Ratio (100% — enough liquid assets
                    to survive 30-day stress scenario).
              These are MANDATORY. Breach = RBI penalty.'
    """
    __tablename__ = "regulatory_ratios"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    entity_id    = Column(String(10), ForeignKey("entities.id"))
    ratio_date   = Column(Date, nullable=False)
    # CRR
    crr_required = Column(Float, default=4.5)
    crr_actual   = Column(Float)
    # SLR
    slr_required = Column(Float, default=18.0)
    slr_actual   = Column(Float)
    # LCR
    lcr_required = Column(Float, default=100.0)
    lcr_actual   = Column(Float)
    # Base
    ndtl         = Column(Float)  # Net Demand and Time Liabilities (base for CRR/SLR)
    is_breach    = Column(Boolean, default=False)
    notes        = Column(Text)
    created_at   = Column(DateTime, server_default=func.now())


# ── Table 7: FX Exposures ─────────────────────────────────────────────────────
class FXExposure(Base):
    """
    Foreign currency positions.
    : 'When we import from the US (pay in USD) or export to Europe
              (receive in EUR), we have FX exposure. If USD/INR moves by 1 rupee,
              our P&L changes. We track hedge_ratio — how much is covered
              by forward contracts. var_1day = max loss in 1 day at 99% confidence.'
    """
    __tablename__ = "fx_exposures"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    entity_id        = Column(String(10), ForeignKey("entities.id"))
    currency_pair    = Column(String(10))         # USDINR, EURINR, GBPINR
    exposure_type    = Column(String(20))         # import / export / borrowing
    notional_amount  = Column(Float)              # In foreign currency
    inr_equivalent   = Column(Float)              # At current spot
    spot_rate        = Column(Float)
    hedge_ratio      = Column(Float, default=0.0) # 0-1 (1 = fully hedged)
    var_1day         = Column(Float)              # Value at Risk, 99% CI, 1 day
    maturity_date    = Column(Date)
    created_at       = Column(DateTime, server_default=func.now())


# ── Table 8: Investment Portfolio ─────────────────────────────────────────────
class Portfolio(Base):
    """
    Treasury investments — where idle cash is parked.
    : 'Instead of keeping ₹500Cr idle in a current account at 0%,
              treasury invests in: Overnight Liquid MFs (6.8-7.2%),
              T-Bills (6.9%), G-Secs (7.1-7.3%), CP/CD (7.5-8%).
              SLR-eligible instruments (G-Secs) count toward the 18% SLR mandate.'
    """
    __tablename__ = "portfolios"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    entity_id         = Column(String(10), ForeignKey("entities.id"))
    instrument_type   = Column(String(30))        # liquid_mf, gsec, tbill, cp, cd
    instrument_name   = Column(String(100))
    isin              = Column(String(12))
    face_value        = Column(Float)
    market_value      = Column(Float)
    yield_to_maturity = Column(Float)             # As percentage
    duration          = Column(Float)             # Modified duration in years
    maturity_date     = Column(Date)
    is_slr_eligible   = Column(Boolean, default=False)
    purchased_at      = Column(Float)             # Purchase price
    created_at        = Column(DateTime, server_default=func.now())


# ── Table 9: Agent Runs ───────────────────────────────────────────────────────
class AgentRun(Base):
    """
    Every CrewAI analysis run is logged here.
    : 'Full audit trail of AI decisions. We log: what was asked,
              which agents ran, how long it took, and the full output.
              This is critical for financial AI — regulators want to know
              why a decision was made.'
    """
    __tablename__ = "agent_runs"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    run_id       = Column(String(36), unique=True)  # UUID
    agent_name   = Column(String(50))
    task         = Column(Text)
    status       = Column(Enum(AgentStatus), default=AgentStatus.PENDING)
    input_data   = Column(JSON)
    output       = Column(Text)
    error        = Column(Text)
    duration_ms  = Column(Integer)
    triggered_by = Column(String(50), default="user")
    started_at   = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime)
