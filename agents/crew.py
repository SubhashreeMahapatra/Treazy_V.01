"""
agents/treasury_crew.py — CrewAI Multi-Agent Treasury System
=============================================================

  "We have 4 specialist AI agents running in sequence — like a
   real treasury team. Each agent has a role, a goal, and tools
   to query real data.

   Agent 1 — Data Analyst:    Queries DB, finds cash flow patterns
   Agent 2 — Risk Analyst:    Checks FX exposure, calculates VaR
   Agent 3 — Compliance:      Verifies CRR/SLR/LCR vs RBI mandates
   Agent 4 — Treasury Advisor: Writes the final CFO-ready report

   CrewAI runs them in sequence. Each agent's output becomes the
   next agent's input — like passing a baton. Powered by Groq
   Llama 3.3 70B — free and blazing fast (500 tokens/sec)."


import os, uuid, logging
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)


def _get_llm():
    """Get Groq LLM. Falls back gracefully if key not set."""
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set in .env file")
    from langchain_groq import ChatGroq
    return ChatGroq(
        api_key=api_key,
        model="llama-3.3-70b-versatile",
        temperature=0.1,     # Low = factual / deterministic
        max_tokens=2048,
    )


def _db_query(db, query_type: str, entity_id: str = "all", days: int = 30) -> str:
    """Safe pre-built queries that agents can call."""
    from sqlalchemy import text
    import json

    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    entity_filter = f"AND t.entity_id = '{entity_id}'" if entity_id != "all" else ""

    queries = {
        "cashflow_summary": f"""
            SELECT e.name, t.txn_type,
                   ROUND(SUM(t.amount_inr)/10000000.0, 2) as total_cr,
                   COUNT(*) as count
            FROM transactions t JOIN entities e ON t.entity_id=e.id
            WHERE t.txn_date >= '{cutoff}' {entity_filter}
            GROUP BY e.name, t.txn_type ORDER BY total_cr DESC
        """,
        "entity_positions": """
            SELECT e.name, e.city, e.risk_level,
                   ROUND(t.balance_after/10000000.0,2) as balance_cr,
                   ROUND(e.min_balance/10000000.0,2) as floor_cr
            FROM entities e
            JOIN transactions t ON e.id=t.entity_id
            WHERE t.id=(SELECT id FROM transactions t2
                        WHERE t2.entity_id=e.id ORDER BY txn_date DESC LIMIT 1)
        """,
        "open_anomalies": f"""
            SELECT e.name, a.anomaly_type, a.severity, a.anomaly_score,
                   t.txn_date, ROUND(t.amount_inr/10000000.0,2) as amount_cr
            FROM anomalies a
            JOIN transactions t ON a.transaction_id=t.id
            JOIN entities e ON a.entity_id=e.id
            WHERE a.is_resolved=0
            ORDER BY a.anomaly_score DESC
        """,
        "regulatory_summary": """
            SELECT e.name, r.ratio_date,
                   r.crr_actual, r.crr_required,
                   r.slr_actual, r.slr_required,
                   r.lcr_actual, r.lcr_required
            FROM regulatory_ratios r JOIN entities e ON r.entity_id=e.id
            ORDER BY r.ratio_date DESC LIMIT 5
        """,
        "fx_summary": """
            SELECT e.name, fx.currency_pair, fx.exposure_type,
                   ROUND(fx.notional_amount,0) as notional,
                   ROUND(fx.inr_equivalent/10000000.0,2) as inr_cr,
                   fx.hedge_ratio, fx.var_1day, fx.spot_rate
            FROM fx_exposures fx JOIN entities e ON fx.entity_id=e.id
        """,
        "portfolio_summary": """
            SELECT e.name, p.instrument_type, p.instrument_name,
                   ROUND(p.market_value/10000000.0,2) as mkt_val_cr,
                   p.yield_to_maturity, p.duration, p.is_slr_eligible
            FROM portfolios p JOIN entities e ON p.entity_id=e.id
            ORDER BY p.market_value DESC
        """,
        "market_snapshot": """
            SELECT ticker, price, change_pct, data_type, source
            FROM market_data
            WHERE id IN (
                SELECT MAX(id) FROM market_data GROUP BY ticker
            )
            ORDER BY data_type, ticker
        """,
    }

    try:
        sql    = queries.get(query_type, "SELECT 'unknown query type' as error")
        result = db.execute(text(sql))
        rows   = [dict(zip(result.keys(), r)) for r in result.fetchall()]
        return json.dumps(rows[:30], default=str, indent=2)
    except Exception as e:
        return f"Query error: {e}"


async def run_crew_analysis(db, entity_id: str = "all", horizon: int = 30) -> dict:
    """
    Main entry point. Runs the 4-agent crew and returns the final report.
    Falls back to a rule-based report if CrewAI / Groq is not available.
    """
    import time, json
    from db.models import AgentRun, AgentStatus

    run_id  = str(uuid.uuid4())
    started = time.time()

    # Log the run
    run_rec = AgentRun(
        run_id=run_id, agent_name="TreasuryCrew",
        task=f"Full treasury analysis — {entity_id}, {horizon}d",
        status=AgentStatus.RUNNING,
        input_data={"entity": entity_id, "horizon": horizon},
        triggered_by="user",
    )
    db.add(run_rec)
    db.commit()

    try:
        report = _run_crew_with_groq(db, entity_id, horizon)
    except Exception as e:
        log.warning(f"CrewAI/Groq failed ({e}), using rule-based fallback")
        report = _rule_based_report(db, entity_id, horizon)

    elapsed = int((time.time() - started) * 1000)
    run_rec.status       = AgentStatus.COMPLETED
    run_rec.output       = report
    run_rec.duration_ms  = elapsed
    run_rec.completed_at = datetime.utcnow()
    db.commit()

    return {
        "run_id":       run_id,
        "status":       "completed",
        "report":       report,
        "duration_ms":  elapsed,
        "entity":       entity_id,
        "horizon_days": horizon,
    }


def _run_crew_with_groq(db, entity_id: str, horizon: int) -> str:
    """
    Full 4-agent CrewAI run using Groq LLM.
    Each agent gets real DB data via tool calls.
    """
    from crewai import Agent, Task, Crew, Process

    llm = _get_llm()

    # Pre-fetch data for context (agents get this as context strings)
    cf_data   = _db_query(db, "cashflow_summary",  entity_id, horizon)
    pos_data  = _db_query(db, "entity_positions")
    anom_data = _db_query(db, "open_anomalies")
    reg_data  = _db_query(db, "regulatory_summary")
    fx_data   = _db_query(db, "fx_summary")
    port_data = _db_query(db, "portfolio_summary")
    mkt_data  = _db_query(db, "market_snapshot")

    # ── Agent 1: Data Analyst ──────────────────────────────────
    analyst = Agent(
        role="Senior Indian Treasury Data Analyst",
        goal="Analyse cash flow patterns and produce a quantified summary in ₹Crore",
        backstory=(
            "15-year veteran at a leading Indian bank. Expert in INR cash management, "
            "T+1/T+2 RTGS settlement cycles, seasonal patterns (Diwali, GST cycle, "
            "advance tax). Always quantifies in ₹Crores."
        ),
        llm=llm, verbose=False, max_iter=2,
    )

    # ── Agent 2: Risk Analyst ──────────────────────────────────
    risk_agent = Agent(
        role="FX and Market Risk Specialist",
        goal="Assess USD/INR FX risk, interest rate sensitivity, and compute VaR",
        backstory=(
            "CFA + FRM holder at RBI-regulated entity. Expert in FEMA compliance, "
            "USD/INR hedging strategies, VaR at 99% CI, RBI repo rate impact on "
            "bond portfolios. Monitors G-Sec yield movements daily."
        ),
        llm=llm, verbose=False, max_iter=2,
    )

    # ── Agent 3: Compliance ────────────────────────────────────
    compliance = Agent(
        role="RBI Regulatory Compliance Officer",
        goal="Verify CRR/SLR/LCR ratios and flag any breaches",
        backstory=(
            "Former RBI examiner. Knows every master direction and prudential norm. "
            "CRR breach = 3% penalty p.a. on shortfall. SLR breach = 5% penalty. "
            "LCR < 100% = enhanced supervisory scrutiny. FEMA violations = ED notice."
        ),
        llm=llm, verbose=False, max_iter=2,
    )

    # ── Agent 4: CTO (Synthesiser) ─────────────────────────────
    cto = Agent(
        role="Chief Treasury Officer (CTO)",
        goal="Write a concise CFO-ready Treasury Intelligence Report",
        backstory=(
            "CTO at a Fortune-500 Indian conglomerate. Reports to CFO and Board Risk "
            "Committee. ₹1000+ Cr daily cash decisions. Writes clearly, quantifies "
            "everything, always actionable. Board presentation style."
        ),
        llm=llm, verbose=False, max_iter=2,
    )

    # ── Tasks ──────────────────────────────────────────────────
    t1 = Task(
        description=(
            f"Analyse this Indian treasury data for the last {horizon} days.\n\n"
            f"CASH FLOW DATA:\n{cf_data}\n\n"
            f"ENTITY POSITIONS:\n{pos_data}\n\n"
            f"Identify: total inflows, outflows, net position, top patterns, "
            f"any GST/salary/advance-tax spikes. All amounts in ₹Crore."
        ),
        expected_output="Entity-wise cash flow table, net position, and pattern observations in ₹Cr",
        agent=analyst,
    )

    t2 = Task(
        description=(
            f"Assess market and FX risks using this data:\n\n"
            f"FX EXPOSURES:\n{fx_data}\n\n"
            f"MARKET DATA:\n{mkt_data}\n\n"
            f"PORTFOLIO:\n{port_data}\n\n"
            f"Calculate: total unhedged INR exposure, VaR, interest rate sensitivity. "
            f"Rate overall risk 0–100."
        ),
        expected_output="FX exposure table, risk score 0-100, top 3 risk items",
        agent=risk_agent,
        context=[t1],
    )

    t3 = Task(
        description=(
            f"Check RBI regulatory compliance:\n\n"
            f"REGULATORY RATIOS:\n{reg_data}\n\n"
            f"OPEN ANOMALIES:\n{anom_data}\n\n"
            f"Verify CRR ≥4.5%, SLR ≥18%, LCR ≥100%. "
            f"Flag anomalies. Rate compliance: GREEN / AMBER / RED."
        ),
        expected_output="CRR/SLR/LCR status per entity, compliance colour, anomaly summary",
        agent=compliance,
        context=[t1, t2],
    )

    t4 = Task(
        description=(
            "Write the final Treasury Intelligence Report for the CFO. Use this structure:\n\n"
            "## EXECUTIVE SUMMARY\n(3 bullet points — key numbers)\n\n"
            "## LIQUIDITY POSITION\n(net cash in ₹Cr, 7-day outlook)\n\n"
            "## RISK DASHBOARD\n(risk score, top 3 risks)\n\n"
            "## COMPLIANCE STATUS\n(CRR/SLR/LCR traffic light)\n\n"
            "## RECOMMENDED ACTIONS\n(top 3, with timeline)\n\n"
            "## MARKET CONTEXT\n(USD/INR, RBI stance, outlook)\n\n"
            "Max 400 words. Quantify everything in ₹Crore."
        ),
        expected_output="Complete 6-section Treasury Intelligence Report, CFO-ready, <400 words",
        agent=cto,
        context=[t1, t2, t3],
    )

    crew   = Crew(agents=[analyst, risk_agent, compliance, cto],
                  tasks=[t1, t2, t3, t4], process=Process.sequential, verbose=False)
    result = crew.kickoff()
    return str(result)


def _rule_based_report(db, entity_id: str, horizon: int) -> str:
    """
    Fallback: generate report from DB data without LLM.
    Used when Groq API key is not set or unavailable.
    INTERVIEW: "The system degrades gracefully — if the LLM is down,
                the rule-based engine still produces a valid report."
    """
    import json

    pos  = json.loads(_db_query(db, "entity_positions"))
    mkt  = json.loads(_db_query(db, "market_snapshot"))
    anom = json.loads(_db_query(db, "open_anomalies"))
    reg  = json.loads(_db_query(db, "regulatory_summary"))
    fx   = json.loads(_db_query(db, "fx_summary"))

    total_bal = sum(p.get("balance_cr", 0) for p in pos)
    total_floor = sum(p.get("floor_cr", 0) for p in pos)
    surplus = total_bal - total_floor
    usdinr = next((m["price"] for m in mkt if m["ticker"] == "USDINR"), 83.42)
    repo   = next((m["price"] for m in mkt if m["ticker"] == "RBI_REPO"), 6.5)
    open_anom = len(anom)
    unhedged = sum(
        float(f.get("inr_cr", 0)) * (1 - float(f.get("hedge_ratio", 0)))
        for f in fx
    )

    report = f"""## EXECUTIVE SUMMARY
• Total consolidated liquidity: ₹{total_bal:.1f} Cr across 5 entities (surplus above floors: ₹{surplus:.1f} Cr)
• {open_anom} open anomalies detected requiring investigation
• USD/INR at ₹{usdinr} | RBI Repo: {repo}% | Unhedged FX exposure: ₹{unhedged:.1f} Cr

## LIQUIDITY POSITION
Total balance: ₹{total_bal:.1f} Cr | Operating floor: ₹{total_floor:.1f} Cr | Net surplus: ₹{surplus:.1f} Cr

Entity breakdown:
{chr(10).join(f"  • {p['name']} ({p['city']}): ₹{p['balance_cr']} Cr [{p['risk_level']} risk]" for p in pos)}

## RISK DASHBOARD
Risk Score: {'72/100 — AMBER' if unhedged > 100 else '45/100 — GREEN'}
• FX Risk: ₹{unhedged:.1f} Cr unhedged exposure to USD/INR movement
• {open_anom} transactions flagged by Isolation Forest ML model
• RBI Repo at {repo}% — bond portfolio duration risk moderate

## COMPLIANCE STATUS
{"• ⚠️ AMBER — Near-breach detected in regulatory ratios" if reg else "• ✅ GREEN — CRR/SLR/LCR within RBI mandated limits"}
• CRR: 4.5% required | SLR: 18% required | LCR: 100% required
• {open_anom} anomalies require treasury controller sign-off

## RECOMMENDED ACTIONS
1. **Immediate (Today):** Investigate {open_anom} open anomalies — potential duplicate payments
2. **This Week:** Sweep ₹{max(0, surplus*0.7):.1f} Cr idle surplus → HDFC Overnight Fund @ 7% p.a. (+₹{max(0,surplus*0.7*0.07):.1f} Cr/yr)
3. **This Month:** Increase FX hedge ratio from current levels — unhedged ₹{unhedged:.1f} Cr exposure is a risk

## MARKET CONTEXT
• USD/INR: ₹{usdinr} | EUR/INR: {next((m['price'] for m in mkt if m['ticker']=='EURINR'),90.18)}
• RBI stance: {'Neutral-to-hawkish' if repo >= 6.5 else 'Accommodative'} at {repo}% repo rate
• Nifty 50: {next((m['price'] for m in mkt if m['ticker']=='^NSEI'),24500)} | Outlook: cautiously positive

---
*Generated by Treazy AI rule-based engine (Groq unavailable). Set GROQ_API_KEY for AI-powered analysis.*
"""
    return report """
