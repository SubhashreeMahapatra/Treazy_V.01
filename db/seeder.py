"""
db/seeder.py — Indian Treasury Data Seeder
==========================================
INTERVIEW: "I modelled REAL Indian business patterns:
  - Salary on 1st of month (huge outflow)
  - GST by 20th every month (CGST + SGST + IGST)
  - Advance tax on 15th Jun/Sep/Dec/Mar
  - Diwali season (Oct-Nov) = 80% inflow boost
  - Month-end receivables (26th-31st) = customer collections
  - TDS deduction from vendor payments
  - RTGS blackout after 6 PM (no same-day settlement)
  All amounts in INR. 5 entities. 365 days = 1825 transactions."
"""

import random
from datetime import datetime, timedelta, date
from db.models import (
    Entity, Transaction, RegulatoryRatio,
    FXExposure, Portfolio, RiskLevel
)


def seed_all(db):
    """Seed all tables. Idempotent — won't duplicate if called again."""
    if db.query(Entity).count() > 0:
        print("ℹ️  Data already seeded, skipping")
        return
    _seed_entities(db)
    _seed_transactions(db)
    _seed_regulatory(db)
    _seed_fx(db)
    _seed_portfolio(db)
    print("✅ Indian treasury data seeded successfully")


# ── Entities ─────────────────────────────────────────────────────────────────
def _seed_entities(db):
    entities = [
        Entity(id="HQ",  name="Treazy HQ — Mumbai",    city="Mumbai",    entity_type="HQ",
               min_balance=5_00_00_000, risk_level=RiskLevel.LOW,
               gst_number="27AAACT1234A1Z5", bank_name="HDFC Bank",
               ifsc_code="HDFC0001234"),
        Entity(id="BLR", name="South Ops — Bengaluru",  city="Bengaluru", entity_type="subsidiary",
               min_balance=2_00_00_000, risk_level=RiskLevel.MEDIUM,
               gst_number="29AAACT1234B1Z3", bank_name="SBI",
               ifsc_code="SBIN0012345"),
        Entity(id="DEL", name="North Division — Delhi",  city="Delhi",    entity_type="subsidiary",
               min_balance=1_50_00_000, risk_level=RiskLevel.MEDIUM,
               gst_number="07AAACT1234C1Z1", bank_name="ICICI Bank",
               ifsc_code="ICIC0001234"),
        Entity(id="KOL", name="East Branch — Kolkata",  city="Kolkata",  entity_type="branch",
               min_balance=75_00_000, risk_level=RiskLevel.HIGH,
               gst_number="19AAACT1234D1Z9", bank_name="Axis Bank",
               ifsc_code="UTIB0001234"),
        Entity(id="CHN", name="South East — Chennai",   city="Chennai",  entity_type="branch",
               min_balance=80_00_000, risk_level=RiskLevel.MEDIUM,
               gst_number="33AAACT1234E1Z7", bank_name="Kotak Bank",
               ifsc_code="KKBK0001234"),
    ]
    db.add_all(entities)
    db.commit()
    print(f"  ✓ Seeded {len(entities)} entities")


# ── Transactions ──────────────────────────────────────────────────────────────
def _seed_transactions(db):
    """365 days × 5 entities = ~1,825 transaction rows"""
    random.seed(42)  # reproducible

    start_date = date(2024, 1, 1)
    end_date   = date(2024, 12, 31)

    # Starting balances per entity (INR)
    balances = {
        "HQ":  10_00_00_000,
        "BLR":  4_00_00_000,
        "DEL":  3_00_00_000,
        "KOL":  1_50_00_000,
        "CHN":  1_80_00_000,
    }

    # Base daily collections per entity (INR)
    base_collections = {
        "HQ":  55_00_000,
        "BLR": 28_00_000,
        "DEL": 22_00_000,
        "KOL": 10_00_000,
        "CHN": 12_00_000,
    }

    # Anomaly dates per entity
    anomaly_dates = {
        "HQ":  ["2024-03-15", "2024-07-22", "2024-11-08"],
        "BLR": ["2024-04-10", "2024-08-19"],
        "DEL": ["2024-05-25", "2024-09-12"],
        "KOL": ["2024-06-30"],
        "CHN": ["2024-10-14", "2024-12-03"],
    }

    txns = []
    current = start_date
    while current <= end_date:
        # Skip Sundays (banks closed) — keep Saturdays as partial
        if current.weekday() == 6:
            current += timedelta(days=1)
            continue

        is_saturday = current.weekday() == 5
        month = current.month
        day   = current.day
        ds    = current.strftime("%Y-%m-%d")

        for eid, base_inflow in base_collections.items():

            # ── INFLOW: daily customer collections ────────────────
            inflow_mult = 1.0
            if month in [10, 11]:              # Diwali season
                inflow_mult *= 1.8
            if day >= 26:                       # Month-end collections
                inflow_mult *= 1.4
            if is_saturday:                     # Half day
                inflow_mult *= 0.4

            inflow = base_inflow * inflow_mult * (0.7 + random.random() * 0.6)
            inflow = round(inflow, 0)

            balances[eid] += inflow
            txns.append(Transaction(
                entity_id=eid, txn_date=current,
                txn_type="customer_receipt", direction="IN",
                amount_inr=inflow, balance_after=balances[eid],
                description=f"Daily collections - {current.strftime('%b %d')}",
                source_system="razorpayx",
            ))

            # ── OUTFLOW: base vendor payments ─────────────────────
            if not is_saturday:
                vendor_out = base_inflow * 0.72 * (0.6 + random.random() * 0.5)
                balances[eid] -= vendor_out
                txns.append(Transaction(
                    entity_id=eid, txn_date=current,
                    txn_type="vendor_payment", direction="OUT",
                    amount_inr=round(vendor_out, 0), balance_after=balances[eid],
                    description="Vendor/supplier payments (RTGS)",
                    source_system="tally",
                ))

            # ── OUTFLOW: Salary — 1st of month ────────────────────
            salary_map = {"HQ":3_50_00_000,"BLR":1_20_00_000,"DEL":95_00_000,"KOL":40_00_000,"CHN":48_00_000}
            if day == 1:
                sal = salary_map[eid]
                balances[eid] -= sal
                txns.append(Transaction(
                    entity_id=eid, txn_date=current,
                    txn_type="salary", direction="OUT",
                    amount_inr=sal, balance_after=balances[eid],
                    description="Monthly salary — NEFT bulk transfer",
                    source_system="hrms",
                ))

            # ── OUTFLOW: GST — 20th of month ──────────────────────
            gst_map = {"HQ":1_80_00_000,"BLR":75_00_000,"DEL":62_00_000,"KOL":22_00_000,"CHN":28_00_000}
            if day == 20:
                gst = gst_map[eid]
                balances[eid] -= gst
                txns.append(Transaction(
                    entity_id=eid, txn_date=current,
                    txn_type="gst_payment", direction="OUT",
                    amount_inr=gst, balance_after=balances[eid],
                    description=f"GST payment — {current.strftime('%b %Y')} (CGST+SGST+IGST)",
                    source_system="gstn_portal",
                ))

            # ── OUTFLOW: Advance Tax — 15th of Mar/Jun/Sep/Dec ────
            adv_tax_map = {"HQ":1_20_00_000,"BLR":48_00_000,"DEL":38_00_000,"KOL":14_00_000,"CHN":18_00_000}
            if day == 15 and month in [3, 6, 9, 12]:
                tax = adv_tax_map[eid]
                qtr = [3,6,9,12].index(month) + 1
                balances[eid] -= tax
                txns.append(Transaction(
                    entity_id=eid, txn_date=current,
                    txn_type="advance_tax", direction="OUT",
                    amount_inr=tax, balance_after=balances[eid],
                    description=f"Advance tax Q{qtr} — OLTAS challan",
                    source_system="income_tax_portal",
                ))

            # ── ANOMALY: inject unusual transactions ──────────────
            if ds in anomaly_dates.get(eid, []):
                fraud_amount = base_inflow * (2.5 + random.random() * 2)
                balances[eid] -= fraud_amount
                txns.append(Transaction(
                    entity_id=eid, txn_date=current,
                    txn_type="unusual_outflow", direction="OUT",
                    amount_inr=round(fraud_amount, 0), balance_after=balances[eid],
                    description="⚠️ ANOMALY: Unusual large outflow — investigate",
                    is_anomaly=True, source_system="manual",
                ))

        current += timedelta(days=1)

    db.add_all(txns)
    db.commit()
    print(f"  ✓ Seeded {len(txns)} transactions")


# ── Regulatory Ratios ─────────────────────────────────────────────────────────
def _seed_regulatory(db):
    """Monthly CRR/SLR/LCR ratios for bank entities (HQ acts as bank)"""
    ratios = []
    for month_offset in range(12):
        d = date(2024, 1, 1) + timedelta(days=30 * month_offset)
        ndtl = 8_000_00_00_000 + random.uniform(-500e9, 500e9)  # ~₹8000 Cr NDTL
        ratios.append(RegulatoryRatio(
            entity_id="HQ",
            ratio_date=d,
            crr_required=4.5,
            crr_actual=round(4.5 + random.uniform(-0.2, 0.8), 2),
            slr_required=18.0,
            slr_actual=round(18.0 + random.uniform(-0.3, 2.0), 2),
            lcr_required=100.0,
            lcr_actual=round(100 + random.uniform(-5, 25), 1),
            ndtl=ndtl,
            is_breach=False,
        ))
    db.add_all(ratios)
    db.commit()
    print(f"  ✓ Seeded {len(ratios)} regulatory ratio records")


# ── FX Exposures ──────────────────────────────────────────────────────────────
def _seed_fx(db):
    """USD/EUR/GBP exposures for importing/exporting entities"""
    exposures = [
        FXExposure(entity_id="HQ",  currency_pair="USDINR", exposure_type="import",
                   notional_amount=5_000_000, spot_rate=83.42,
                   inr_equivalent=5_000_000*83.42, hedge_ratio=0.65, var_1day=8_50_000),
        FXExposure(entity_id="HQ",  currency_pair="EURINR", exposure_type="export",
                   notional_amount=2_000_000, spot_rate=90.18,
                   inr_equivalent=2_000_000*90.18, hedge_ratio=0.45, var_1day=5_20_000),
        FXExposure(entity_id="BLR", currency_pair="USDINR", exposure_type="import",
                   notional_amount=1_500_000, spot_rate=83.42,
                   inr_equivalent=1_500_000*83.42, hedge_ratio=0.80, var_1day=2_10_000),
        FXExposure(entity_id="DEL", currency_pair="GBPINR", exposure_type="borrowing",
                   notional_amount=500_000, spot_rate=105.60,
                   inr_equivalent=500_000*105.60, hedge_ratio=0.30, var_1day=1_80_000),
    ]
    db.add_all(exposures)
    db.commit()
    print(f"  ✓ Seeded {len(exposures)} FX exposure records")


# ── Investment Portfolio ──────────────────────────────────────────────────────
def _seed_portfolio(db):
    """Indian treasury instruments — where idle cash is invested"""
    instruments = [
        Portfolio(entity_id="HQ", instrument_type="liquid_mf",
                  instrument_name="HDFC Overnight Fund — Direct",
                  face_value=50_00_00_000, market_value=50_12_00_000,
                  yield_to_maturity=7.05, duration=0.003,
                  is_slr_eligible=False, purchased_at=50_00_00_000),
        Portfolio(entity_id="HQ", instrument_type="gsec",
                  instrument_name="7.18% GS 2033 (10Y Benchmark)",
                  isin="IN0020220192",
                  face_value=100_00_00_000, market_value=98_50_00_000,
                  yield_to_maturity=7.28, duration=6.8,
                  is_slr_eligible=True, purchased_at=99_00_00_000,
                  maturity_date=date(2033, 9, 14)),
        Portfolio(entity_id="HQ", instrument_type="tbill",
                  instrument_name="91-Day T-Bill",
                  face_value=25_00_00_000, market_value=24_57_00_000,
                  yield_to_maturity=6.92, duration=0.25,
                  is_slr_eligible=True, purchased_at=24_57_00_000),
        Portfolio(entity_id="BLR", instrument_type="liquid_mf",
                  instrument_name="SBI Overnight Fund — Direct",
                  face_value=15_00_00_000, market_value=15_04_00_000,
                  yield_to_maturity=6.88, duration=0.003,
                  is_slr_eligible=False, purchased_at=15_00_00_000),
        Portfolio(entity_id="DEL", instrument_type="cd",
                  instrument_name="HDFC Bank CD — 90 Day",
                  face_value=10_00_00_000, market_value=10_18_00_000,
                  yield_to_maturity=7.45, duration=0.25,
                  is_slr_eligible=False, purchased_at=10_00_00_000,
                  maturity_date=date(2024, 12, 31)),
    ]
    db.add_all(instruments)
    db.commit()
    print(f"  ✓ Seeded {len(instruments)} portfolio instruments")
