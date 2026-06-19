# Treazy AI — Indian Treasury Intelligence Platform

Full-stack AI treasury management 
**Python FastAPI + SQLite + ARIMA + Isolation Forest + CrewAI + Groq + React**

---

## ⚡ QUICK START (Do this tonight)

### Step 1 — Clone & setup backend
```bash
cd treazy-ai/backend
pip install -r requirements.txt

cp .env.example .env
# Edit .env → paste your GROQ_API_KEY from https://console.groq.com

python -m uvicorn main:app --reload --port 8000
```
Backend running at → http://localhost:8000
API docs (show in demo) → **http://localhost:8000/docs**

### Step 2 — Start frontend
```bash
cd treazy-ai/frontend
npm install
npm run dev
```
Dashboard → **http://localhost:3000**

### Step 3 — Verify everything works
- Dashboard loads with Indian market ticker (USD/INR live)
- Click "Run ARIMA Forecast" on Forecasting tab → shows MAPE %
- Click "Run Detection" on Anomaly tab → lists flagged transactions
- Click "Run LP Optimizer" on Optimization tab → sweep recommendations
- SQL tab → click any preset → see real data from SQLite
- AI Agents tab → click "Run 4-Agent Crew" → CrewAI report

---

## 🗄️ Database

**Default:** SQLite (zero setup — works out of box)
```
DATABASE_URL=sqlite:///./treazy.db
```

**MySQL Workbench :**
```sql
-- In MySQL Workbench, run:
CREATE DATABASE treazy_db CHARACTER SET utf8mb4;
```
```
# Then in .env:
DATABASE_URL=mysql+pymysql://root:yourpassword@localhost:3306/treazy_db
```
Same code works for both — zero changes.

---

## 🏗️ Project Structure

```
treazy-ai/
├── backend/
│   ├── main.py                    ← FastAPI app, all REST endpoints
│   ├── requirements.txt
│   ├── .env.example               ← Copy to .env, add GROQ key
│   ├── db/
│   │   ├── models.py              ← SQLAlchemy ORM (9 tables)
│   │   ├── session.py             ← DB connection (SQLite/MySQL)
│   │   └── seeder.py              ← 365 days Indian treasury data
│   ├── services/
│   │   ├── ml_service.py          ← ARIMA + Isolation Forest + LP
│   │   └── market_service.py      ← Free APIs (forex, NSE, RBI)
│   └── agents/
│       └── treasury_crew.py       ← CrewAI 4-agent system
└── frontend/
    ├── src/
    │   └── TreazyAI.jsx           ← Complete React dashboard (9 tabs)
    ├── vite.config.js             ← Proxy /api → localhost:8000
    └── package.json
```

---

## 📊 Database Schema (9 tables)

| Table | What it stores |
|-------|---------------|
| `entities` | 5 Indian business branches (Mumbai, Bengaluru, Delhi, Kolkata, Chennai) |
| `transactions` | Every cash in/out — salary, GST, advance tax, vendor payments |
| `forecasts` | ARIMA predictions stored for audit trail |
| `anomalies` | Isolation Forest flags with severity |
| `market_data` | Live USD/INR, NSE Nifty, RBI repo rate |
| `regulatory_ratios` | CRR / SLR / LCR compliance tracking |
| `fx_exposures` | USD/EUR/GBP positions with hedge ratios |
| `portfolios` | G-Secs, T-Bills, Liquid MFs |
| `agent_runs` | Every CrewAI run logged for audit |

---

## 🔌 Free APIs Used

| API | What it provides | Key needed? |
|-----|-----------------|-------------|
| ExchangeRate-API | Live USD/INR, EUR/INR, GBP/INR | ❌ No |
| yfinance | NSE Nifty 50, HDFC Bank, SBI prices | ❌ No |
| Groq API | Llama 3.3 70B LLM for AI agents | ✅ Free key |
| RBI DBIE | Repo rate (6.5%), CRR, SLR | Hardcoded known values |

---

## 🤖 AI Architecture

```
CrewAI Sequential Pipeline:

User Request
    ↓
Agent 1: Data Analyst
  → Queries SQLite for cash flow patterns
  → Reports in ₹Crore
    ↓
Agent 2: Risk Analyst
  → Checks USD/INR FX exposure
  → Calculates VaR at 99% confidence
  → Scores risk 0-100
    ↓
Agent 3: Compliance Officer
  → Verifies CRR ≥ 4.5% (RBI mandate)
  → Verifies SLR ≥ 18% (RBI mandate)
  → Verifies LCR ≥ 100% (RBI mandate)
    ↓
Agent 4: Chief Treasury Officer
  → Synthesises all findings
  → Writes CFO-ready 6-section report
    ↓
Output saved to agent_runs table (audit trail)
```

---

## 🗓️ Indian Financial Calendar 

| Date | Event | Impact |
|------|-------|--------|
| 1st of month | **Salary** (NEFT bulk) | Large fixed outflow |
| 20th of month | **GST payment** (CGST+SGST+IGST) | Every month, no exceptions |
| 15th Mar/Jun/Sep/Dec | **Advance Tax** (OLTAS challan) | Quarterly, huge outflow |
| 26th–31st | **Month-end collections** | Customer invoices paid |
| Oct–Nov | **Diwali season** | Inflow up 80–120% |
| Mar 31 | **India FY end** (Apr–Mar FY) | Balance sheet finalisation |

---



### Intro
> "Every Indian corporate treasury team answers three questions daily:
> How much cash do we have across all entities? Will we have enough
> to pay GST on the 20th and salary on the 1st? And are we losing
> money on idle cash sitting at 0% in current accounts?
> Treazy AI answers all three — with real ML models and AI agents."

### On ARIMA
> "ARIMA(2,1,2): AR=2 uses 2 past balance values. I=1 differences
> once to remove trend. MA=2 corrects past errors. Trained on 90 days
> of real SQLite data. MAPE of 0.93% — that's production-grade."

### On Isolation Forest
> "Normal transactions cluster together — they need many random splits
> to isolate. Anomalies like duplicate vendor payments or fraud are
> statistically rare — they're isolated in very few splits.
> Score 0→1, threshold 0.65. We flag, save to DB, treasury investigates."

### On LP Optimizer
> "Linear programming: maximise sum of balance × yield per entity.
> Constraint: balance must stay above minimum operating floor.
> Output: sweep ₹84Cr idle cash to HDFC Overnight Fund at 7% p.a.
> That's ₹5.9Cr recovered per year on money that was earning zero."

### On CrewAI
> "Four specialist agents in sequence — Data Analyst queries our SQLite,
> Risk Analyst checks USD/INR exposure and VaR, Compliance verifies
> CRR/SLR/LCR against RBI mandates, then the CTO agent writes the
> final CFO-ready report. All powered by Groq Llama 3.3 70B — free.
> Every run is logged in the agent_runs table for regulatory audit."

### On SQL / Database
> "Same SQLAlchemy ORM works on SQLite locally and MySQL in production.
> One line change in .env — zero code changes. Schema has 9 tables
> covering the full Indian treasury domain: transactions, regulatory
> ratios, FX exposures, investment portfolio, and full audit trail."

### On ETL
> "9 connectors: Tally Prime, HDFC Bank API, SBI Corporate Net,
> GSTN Portal, RBI DBIE, NSE FeedQ, RazorpayX, Zoho Books, ExchangeRate-API.
> Extract → Transform (clean, INR normalise, dedup) → Load into SQLite.
> Then ML models and CrewAI agents run on clean data."

---

## 🔑 Key Indian Finance Terms to Know

| Term | Explanation |
|------|-------------|
| **₹ Crore** | ₹1,00,00,000 (10 million). All amounts shown in Crore in this app |
| **GST** | Goods & Services Tax. Paid by 20th every month. CGST + SGST + IGST |
| **Advance Tax** | Corporate income tax paid in 4 instalments. 15th Jun/Sep/Dec/Mar |
| **RTGS** | Real-Time Gross Settlement. High-value transfers. 7AM–6PM only |
| **CRR** | Cash Reserve Ratio = 4.5% of deposits kept with RBI. Mandatory |
| **SLR** | Statutory Liquidity Ratio = 18% in govt securities. Mandatory |
| **LCR** | Liquidity Coverage Ratio ≥ 100%. Survive 30-day stress scenario |
| **DSO** | Days Sales Outstanding — how long to collect from customers |
| **DPO** | Days Payable Outstanding — how long to pay suppliers |
| **G-Sec** | Government Security (bond). Risk-free. SLR-eligible |
| **T-Bill** | 91/182/364-day treasury bill. Yield ~6.9% |
| **Liquid MF** | Overnight liquid mutual fund. Yield ~7%. Best for idle cash |
| **FEMA** | Foreign Exchange Management Act — governs FX transactions |
| **VaR** | Value at Risk — max loss at 99% confidence over 1 day |

---

## 📡 API Endpoints (show /docs in demo)

```
GET  /api/health              Health check
GET  /api/dashboard           KPIs + entities + market ticker
GET  /api/cashflow/{entity}   Daily cash flow chart data
POST /api/forecast/{entity}   Run ARIMA → return 30-day forecast
POST /api/anomalies/detect/{entity}  Run Isolation Forest
GET  /api/anomalies           All open anomalies from DB
GET  /api/scenario?shock=0    What-if scenario engine
GET  /api/optimize            LP cash positioning optimizer
GET  /api/market              Live forex + NSE + macro data
GET  /api/portfolio           Investment portfolio
GET  /api/compliance          CRR/SLR/LCR ratios
GET  /api/etl/status          ETL pipeline connector status
POST /api/sql                 Run any SELECT on SQLite
POST /api/agents/run          Launch 4-agent CrewAI crew
GET  /api/agents/history      Past agent run audit log
```

---

Built with: Python 3.12 · FastAPI · SQLAlchemy · SQLite/MySQL · scikit-learn · statsmodels · CrewAI · LangChain · Groq Llama 3.3 70B · React 18 · Recharts · Vite
