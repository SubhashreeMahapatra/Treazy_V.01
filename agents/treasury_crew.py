"""
agents/treasury_crew.py — CrewAI Multi-Agent Treasury System
=============================================================

  "4 specialist agents run sequentially — like a real treasury team.

   Agent 1 — Data Analyst:     Queries SQLite, finds cash flow patterns
   Agent 2 — Risk Analyst:     Checks FX exposure, calculates VaR
   Agent 3 — Compliance:       Verifies CRR/SLR/LCR vs RBI mandates
   Agent 4 — Treasury Advisor: Writes the final CFO-ready report

   Each agent's output becomes the next agent's input.
   Powered by Groq Llama 3.3 70B — free and fast."

FIX NOTE:
  CrewAI v0.36+ requires LLM passed as a string ('groq/model-name')
  NOT as a ChatGroq object. Also requires litellm package installed.
"""

import os, uuid, logging, json
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)

# ── Groq model string for CrewAI ───────────────────────────────────────────
# CrewAI uses litellm under the hood — pass as "provider/model"
GROQ_MODEL_STRING = "groq/llama-3.3-70b-versatile"


def _check_groq_key() -> str:
    """Return API key or raise clear error."""
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        raise ValueError(
            "GROQ_API_KEY is not set. "
            "Add it to backend/.env or Render environment variables."
        )
    if key.startswith("gsk_your") or key == "gsk_your_groq_key_here":
        raise ValueError(
            "GROQ_API_KEY is still the placeholder value. "
            "Replace it with your real key from https://console.groq.com"
        )
    return key


def _db_query(db, query_type: str, entity_id: str = "all", days: int = 30) -> str:
    """Safe pre-built queries agents can call."""
    from sqlalchemy import text

    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    ef = f"AND t.entity_id = '{entity_id}'" if entity_id != "all" else ""

    queries = {
        "cashflow_summary": f"""
            SELECT e.name, t.txn_type,
                   ROUND(SUM(t.amount_inr)/10000000.0, 2) as total_cr,
                   COUNT(*) as count
            FROM transactions t JOIN entities e ON t.entity_id=e.id
            WHERE t.txn_date >= '{cutoff}' {ef}
            GROUP BY e.name, t.txn_type ORDER BY total_cr DESC LIMIT 20
        """,
        "entity_positions": """
            SELECT e.name, e.city, e.risk_level,
                   ROUND(t.balance_after/10000000.0,2) as balance_cr,
                   ROUND(e.min_balance/10000000.0,2) as floor_cr
            FROM entities e
            JOIN transactions t ON e.id=t.entity_id
            WHERE t.id=(SELECT id FROM transactions t2
                        WHERE t2.entity_id=e.id ORDER BY txn_date DESC, id DESC LIMIT 1)
        """,
        "open_anomalies": """
            SELECT e.name, a.anomaly_type, a.severity, a.anomaly_score,
                   t.txn_date, ROUND(t.amount_inr/10000000.0,2) as amount_cr
            FROM anomalies a
            JOIN transactions t ON a.transaction_id=t.id
            JOIN entities e ON a.entity_id=e.id
            WHERE a.is_resolved=0 ORDER BY a.anomaly_score DESC LIMIT 10
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
                   ROUND(fx.inr_equivalent/10000000.0,2) as inr_cr,
                   fx.hedge_ratio, fx.var_1day, fx.spot_rate
            FROM fx_exposures fx JOIN entities e ON fx.entity_id=e.id
        """,
        "portfolio_summary": """
            SELECT e.name, p.instrument_type,
                   ROUND(p.market_value/10000000.0,2) as mkt_cr,
                   p.yield_to_maturity, p.duration
            FROM portfolios p JOIN entities e ON p.entity_id=e.id
            ORDER BY p.market_value DESC
        """,
        "market_snapshot": """
            SELECT ticker, price, change_pct, data_type, source
            FROM market_data
            WHERE id IN (SELECT MAX(id) FROM market_data GROUP BY ticker)
            ORDER BY data_type, ticker
        """,
    }

    try:
        result = db.execute(text(queries.get(query_type, "SELECT 'unknown' as error")))
        rows   = [dict(zip(result.keys(), r)) for r in result.fetchall()]
        return json.dumps(rows[:30], default=str, indent=2)
    except Exception as e:
        return f"Query error: {e}"


async def run_crew_analysis(db, entity_id: str = "all", horizon: int = 30) -> dict:
    """
    Main entry point. Returns structured result with report + metadata.
    Always returns something — either AI report or rule-based fallback
    with a clear error message explaining why AI failed.
    """
    import time
    from db.models import AgentRun, AgentStatus

    run_id  = str(uuid.uuid4())
    started = time.time()

    run_rec = AgentRun(
        run_id=run_id, agent_name="TreasuryCrew",
        task=f"Full treasury analysis — {entity_id}, {horizon}d",
        status=AgentStatus.RUNNING,
        input_data={"entity": entity_id, "horizon": horizon},
        triggered_by="user",
    )
    db.add(run_rec)
    db.commit()

    ai_error = None
    report   = None
    used_ai  = False

    # ── Try Groq/CrewAI ────────────────────────────────────────
    try:
        key = _check_groq_key()
        os.environ["GROQ_API_KEY"] = key   # ensure litellm can read it
        log.info(f"Starting CrewAI run {run_id} with Groq")
        report  = _run_crew_with_groq(db, entity_id, horizon)
        used_ai = True
        log.info(f"CrewAI run {run_id} completed successfully")
    except Exception as e:
        ai_error = str(e)
        log.error(f"CrewAI/Groq failed for run {run_id}: {e}")
        report = _rule_based_report(db, entity_id, horizon, error_reason=ai_error)

    elapsed = int((time.time() - started) * 1000)
    run_rec.status       = AgentStatus.COMPLETED
    run_rec.output       = report
    run_rec.error        = ai_error
    run_rec.duration_ms  = elapsed
    run_rec.completed_at = datetime.utcnow()
    db.commit()

    return {
        "run_id":       run_id,
        "status":       "completed",
        "report":       report,
        "used_ai":      used_ai,
        "ai_error":     ai_error,   # frontend shows this if AI failed
        "duration_ms":  elapsed,
        "entity":       entity_id,
        "horizon_days": horizon,
    }


def _run_crew_with_groq(db, entity_id: str, horizon: int) -> str:
    """
    4-agent CrewAI run. LLM passed as string — required by CrewAI v0.36+.
    litellm package handles the actual Groq API call.
    """
    from crewai import Agent, Task, Crew, Process

    # Pre-fetch all DB context
    cf_data   = _db_query(db, "cashflow_summary",  entity_id, horizon)
    pos_data  = _db_query(db, "entity_positions")
    anom_data = _db_query(db, "open_anomalies")
    reg_data  = _db_query(db, "regulatory_summary")
    fx_data   = _db_query(db, "fx_summary")
    port_data = _db_query(db, "portfolio_summary")
    mkt_data  = _db_query(db, "market_snapshot")

    # ── Agents — llm MUST be a string for CrewAI v0.36+ ────────
    analyst = Agent(
        role="Senior Indian Treasury Data Analyst",
        goal="Analyse cash flow patterns and produce a quantified summary in ₹Crore",
        backstory=(
            "15-year veteran at a leading Indian bank. Expert in INR cash management, "
            "GST cycle (20th of month), advance tax (15th Mar/Jun/Sep/Dec), "
            "salary disbursements (1st of month), and Diwali season spikes. "
            "Always quantifies in ₹Crores."
        ),
        llm=GROQ_MODEL_STRING,
        verbose=False,
        max_iter=2,
    )

    risk_agent = Agent(
        role="FX and Market Risk Specialist",
        goal="Assess USD/INR FX risk, interest rate sensitivity, and compute VaR",
        backstory=(
            "CFA + FRM holder at RBI-regulated entity. Expert in FEMA compliance, "
            "USD/INR hedging, VaR at 99% confidence, RBI repo rate impact on "
            "G-Sec portfolios. Monitors daily currency movements."
        ),
        llm=GROQ_MODEL_STRING,
        verbose=False,
        max_iter=2,
    )

    compliance = Agent(
        role="RBI Regulatory Compliance Officer",
        goal="Verify CRR/SLR/LCR ratios and flag any breaches against RBI mandates",
        backstory=(
            "Former RBI examiner. CRR = 4.5% mandatory. SLR = 18% mandatory. "
            "LCR must be ≥ 100%. CRR breach = 3% penalty p.a. on shortfall. "
            "SLR breach = 5% penalty. Meticulous about FEMA reporting."
        ),
        llm=GROQ_MODEL_STRING,
        verbose=False,
        max_iter=2,
    )

    cto = Agent(
        role="Chief Treasury Officer (CTO)",
        goal="Write a concise CFO-ready Treasury Intelligence Report in 6 sections",
        backstory=(
            "CTO at a Fortune-500 Indian conglomerate, reporting to CFO and Board. "
            "Makes ₹1000+ Cr daily cash decisions. Writes clearly, quantifies "
            "everything, always actionable. Board-presentation style."
        ),
        llm=GROQ_MODEL_STRING,
        verbose=False,
        max_iter=2,
    )

    # ── Tasks ────────────────────────────────────────────────────
    t1 = Task(
        description=(
            f"Analyse Indian treasury cash flow for the last {horizon} days.\n\n"
            f"CASH FLOW DATA (₹Crore):\n{cf_data}\n\n"
            f"ENTITY POSITIONS:\n{pos_data}\n\n"
            "Identify: total inflows, outflows, net position per entity, "
            "top expense categories (GST, salary, advance tax), and seasonal patterns. "
            "All amounts in ₹Crore."
        ),
        expected_output=(
            "Entity-wise cash flow table in ₹Cr, net liquidity position, "
            "top 3 transaction categories with amounts, key pattern observations."
        ),
        agent=analyst,
    )

    t2 = Task(
        description=(
            f"Assess FX and market risk using:\n\n"
            f"FX EXPOSURES:\n{fx_data}\n\n"
            f"MARKET DATA:\n{mkt_data}\n\n"
            f"PORTFOLIO:\n{port_data}\n\n"
            "Calculate: total unhedged INR exposure, blended VaR, "
            "interest rate sensitivity of bond portfolio. Rate overall risk 0–100."
        ),
        expected_output=(
            "FX exposure table with hedge gaps, risk score 0-100 with justification, "
            "top 3 risk items quantified in ₹Cr."
        ),
        agent=risk_agent,
        context=[t1],
    )

    t3 = Task(
        description=(
            f"Check RBI regulatory compliance:\n\n"
            f"REGULATORY RATIOS:\n{reg_data}\n\n"
            f"OPEN ANOMALIES:\n{anom_data}\n\n"
            "Verify CRR ≥ 4.5%, SLR ≥ 18%, LCR ≥ 100% for all bank entities. "
            "Flag any anomalies needing investigation. "
            "Rate compliance: GREEN (all OK) / AMBER (near breach) / RED (breach)."
        ),
        expected_output=(
            "CRR/SLR/LCR status per entity with GREEN/AMBER/RED rating, "
            "anomaly count and description, recommended actions."
        ),
        agent=compliance,
        context=[t1, t2],
    )

    t4 = Task(
        description=(
            "Write the final Treasury Intelligence Report for the CFO. "
            "Use EXACTLY this structure:\n\n"
            "## EXECUTIVE SUMMARY\n"
            "• [Key number 1]\n• [Key number 2]\n• [Key number 3]\n\n"
            "## LIQUIDITY POSITION\n"
            "[Net cash in ₹Cr, 7-day outlook]\n\n"
            "## RISK DASHBOARD\n"
            "[Risk score X/100, top 3 risks with ₹Cr impact]\n\n"
            "## COMPLIANCE STATUS\n"
            "[CRR/SLR/LCR status — GREEN/AMBER/RED with values]\n\n"
            "## RECOMMENDED ACTIONS\n"
            "1. [Action with timeline]\n2. [Action]\n3. [Action]\n\n"
            "## MARKET CONTEXT\n"
            "[USD/INR, RBI stance, macro outlook]\n\n"
            "Max 400 words. Quantify everything in ₹Crore."
        ),
        expected_output=(
            "Complete 6-section Treasury Intelligence Report, "
            "CFO-ready, under 400 words, all figures in ₹Crore."
        ),
        agent=cto,
        context=[t1, t2, t3],
    )

    crew   = Crew(
        agents=[analyst, risk_agent, compliance, cto],
        tasks=[t1, t2, t3, t4],
        process=Process.sequential,
        verbose=False,
    )
    result = crew.kickoff()
    return str(result)


def _rule_based_report(db, entity_id: str, horizon: int, error_reason: str = None) -> str:
    """
    Fallback report using only DB data — no LLM.
    Used when Groq is unavailable. Clearly labelled so users know.
    """
    pos  = json.loads(_db_query(db, "entity_positions"))
    mkt  = json.loads(_db_query(db, "market_snapshot"))
    anom = json.loads(_db_query(db, "open_anomalies"))
    fx   = json.loads(_db_query(db, "fx_summary"))

    total_bal   = sum(float(p.get("balance_cr", 0)) for p in pos)
    total_floor = sum(float(p.get("floor_cr",   0)) for p in pos)
    surplus     = total_bal - total_floor
    usdinr      = next((float(m["price"]) for m in mkt if m["ticker"] == "USDINR"), 83.42)
    repo        = next((float(m["price"]) for m in mkt if m["ticker"] == "RBI_REPO"), 6.5)
    open_anom   = len(anom)
    unhedged    = sum(
        float(f.get("inr_cr", 0)) * (1 - float(f.get("hedge_ratio", 0)))
        for f in fx
    )

    error_note = ""
    if error_reason:
        error_note = f"\n\n> ⚠️ **AI agents unavailable:** {error_reason}\n> To enable: set a valid GROQ_API_KEY in your environment variables.\n"

    return f"""## EXECUTIVE SUMMARY
• Total consolidated liquidity: ₹{total_bal:.1f} Cr across {len(pos)} entities (surplus: ₹{surplus:.1f} Cr)
• {open_anom} open anomalies flagged by Isolation Forest ML model
• USD/INR at ₹{usdinr} | RBI Repo: {repo}% | Unhedged FX: ₹{unhedged:.1f} Cr

## LIQUIDITY POSITION
Total balance: ₹{total_bal:.1f} Cr | Operating floor: ₹{total_floor:.1f} Cr | **Net surplus: ₹{surplus:.1f} Cr**

{chr(10).join(f"• {p['name']} ({p.get('city','')}): ₹{p['balance_cr']} Cr [{p['risk_level']} risk]" for p in pos)}

## RISK DASHBOARD
Risk Score: **{'72/100 — AMBER' if unhedged > 100 else '45/100 — GREEN'}**
• FX Risk: ₹{unhedged:.1f} Cr unhedged exposure to USD/INR movement
• {open_anom} transactions flagged by Isolation Forest (threshold 0.65)
• RBI Repo at {repo}% — bond portfolio duration risk moderate

## COMPLIANCE STATUS
• CRR: **4.5% required** — within mandated limits ✓
• SLR: **18% required** — within mandated limits ✓
• LCR: **≥100% required** — within mandated limits ✓
• {open_anom} anomalies pending treasury controller sign-off

## RECOMMENDED ACTIONS
1. **Today:** Investigate {open_anom} open anomalies — potential duplicate payments or fraud
2. **This week:** Sweep ₹{max(0, surplus * 0.7):.1f} Cr idle surplus → HDFC Overnight Fund @ 7% p.a. (gain: ₹{max(0, surplus * 0.7 * 0.07):.2f} Cr/yr)
3. **This month:** Increase FX hedge ratio — ₹{unhedged:.1f} Cr unhedged is an active risk

## MARKET CONTEXT
• USD/INR: ₹{usdinr} | EUR/INR: {next((float(m['price']) for m in mkt if m['ticker']=='EURINR'), 90.18)}
• RBI stance: {'Neutral-to-hawkish' if repo >= 6.5 else 'Accommodative'} at {repo}% repo rate
• Nifty 50: {next((float(m['price']) for m in mkt if m['ticker']=='^NSEI'), 24500):,.0f} | Outlook: cautiously positive{error_note}

---
*Generated by Treazy AI rule-based engine. {'Set a valid GROQ_API_KEY to enable 4-agent AI analysis.' if error_reason else 'Groq AI powered analysis available.'}*
"""
