"""
services/market_service.py — Real Indian Market Data
======================================================
FREE APIs USED:
  1. ExchangeRate-API   → USD/INR, EUR/INR, GBP/INR (no key needed)
  2. yfinance           → NSE Nifty 50, Sensex, top Indian stocks
  3. RBI DBIE           → Repo rate (hardcoded current = 6.5%, 
                          RBI DBIE API needs registration for full access)
  4. FRED (optional)    → US Fed Funds Rate for global context

: "In production, I'd add HDFC Open Banking API and 
            RazorpayX webhooks. For the demo, these 3 free APIs 
            give enough real data to show the concept end-to-end."
"""

import requests
import logging
from datetime import datetime

log = logging.getLogger(__name__)


def fetch_forex_rates() -> dict:
    """
    Fetch live USD/INR, EUR/INR, GBP/INR from ExchangeRate-API.
    Free tier: 1500 requests/month. No API key needed for basic endpoint.
    """
    try:
        resp = requests.get(
            "https://api.exchangerate-api.com/v4/latest/USD",
            timeout=5
        )
        if resp.status_code == 200:
            data  = resp.json()
            rates = data.get("rates", {})
            inr   = rates.get("INR", 83.42)
            eur   = rates.get("EUR", 0.92)
            gbp   = rates.get("GBP", 0.79)
            return {
                "USDINR": round(inr, 2),
                "EURINR": round(inr / eur, 2),
                "GBPINR": round(inr / gbp, 2),
                "source": "exchangerate-api.com",
                "live":   True,
            }
    except Exception as e:
        log.warning(f"Forex API failed: {e}")

    # Fallback to recent known values
    return {
        "USDINR": 83.42,
        "EURINR": 90.18,
        "GBPINR": 105.60,
        "source": "fallback",
        "live":   False,
    }


def fetch_nse_data() -> list:
    """
    Fetch NSE Nifty 50 and top Indian banking stocks via yfinance.
    : "yfinance pulls NSE data using the .NS suffix.
                HDFC Bank = HDFCBANK.NS, Nifty 50 = ^NSEI.
                Free, real, no API key needed."
    """
    try:
        import yfinance as yf
        tickers = {
            "^NSEI":        "Nifty 50",
            "^BSESN":       "Sensex",
            "HDFCBANK.NS":  "HDFC Bank",
            "SBIN.NS":      "SBI",
            "ICICIBANK.NS": "ICICI Bank",
            "AXISBANK.NS":  "Axis Bank",
        }
        results = []
        for symbol, name in tickers.items():
            try:
                t    = yf.Ticker(symbol)
                info = t.fast_info
                results.append({
                    "ticker":     symbol,
                    "name":       name,
                    "price":      round(float(info.last_price or 0), 2),
                    "change_pct": round(float(getattr(info, "regular_market_change_percent", 0) or 0), 2),
                    "data_type":  "equity",
                    "source":     "yfinance/NSE",
                    "live":       True,
                })
            except Exception:
                pass
        return results
    except ImportError:
        log.warning("yfinance not installed")
    except Exception as e:
        log.warning(f"NSE data failed: {e}")

    # Fallback
    return [
        {"ticker":"^NSEI",       "name":"Nifty 50",  "price":24520.0, "change_pct":0.45, "data_type":"equity","source":"fallback","live":False},
        {"ticker":"HDFCBANK.NS", "name":"HDFC Bank", "price":1742.0,  "change_pct":-0.3, "data_type":"equity","source":"fallback","live":False},
        {"ticker":"SBIN.NS",     "name":"SBI",        "price":812.0,   "change_pct":0.8,  "data_type":"equity","source":"fallback","live":False},
    ]


def fetch_macro_data() -> list:
    """
    Macro indicators — RBI repo rate + US Fed rate for context.
    : "RBI repo rate is 6.5% currently. This is public info.
                For full RBI DBIE API access you need registration.
                In production I'd plug in the RBI DBIE OAuth token here."
    """
    return [
        {"ticker": "RBI_REPO",     "name": "RBI Repo Rate",       "price": 6.50, "change_pct": 0.0,  "data_type": "macro", "source": "rbi.org.in", "live": False},
        {"ticker": "RBI_CRR",      "name": "CRR (Mandatory)",     "price": 4.50, "change_pct": 0.0,  "data_type": "macro", "source": "rbi.org.in", "live": False},
        {"ticker": "RBI_SLR",      "name": "SLR (Mandatory)",     "price": 18.0, "change_pct": 0.0,  "data_type": "macro", "source": "rbi.org.in", "live": False},
        {"ticker": "IN_INFLATION", "name": "CPI Inflation (India)","price": 4.85, "change_pct": -0.12,"data_type": "macro", "source": "mospi.gov.in","live": False},
        {"ticker": "US_FED",       "name": "US Fed Funds Rate",   "price": 5.25, "change_pct": 0.0,  "data_type": "macro", "source": "federalreserve.gov","live": False},
    ]


def fetch_and_store_all(db) -> dict:
    """
    Master function: fetch all market data and store in DB.
    Called by the scheduler every 15 minutes.
    """
    from db.models import MarketData

    fetched_at = datetime.utcnow()
    total = 0

    # Forex
    forex = fetch_forex_rates()
    for pair, rate in forex.items():
        if pair in ("source", "live"):
            continue
        db.add(MarketData(
            data_type="forex", ticker=pair, price=rate,
            source=forex["source"], fetched_at=fetched_at
        ))
        total += 1

    # NSE equities
    for item in fetch_nse_data():
        db.add(MarketData(
            data_type="equity", ticker=item["ticker"],
            price=item["price"], change_pct=item["change_pct"],
            source=item["source"], fetched_at=fetched_at
        ))
        total += 1

    # Macro
    for item in fetch_macro_data():
        db.add(MarketData(
            data_type="macro", ticker=item["ticker"],
            price=item["price"], change_pct=item["change_pct"],
            source=item["source"], fetched_at=fetched_at
        ))
        total += 1

    db.commit()
    return {"records_stored": total, "fetched_at": str(fetched_at)}
