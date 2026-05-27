from flask import Flask, render_template, jsonify, request
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

app = Flask(__name__)

ASSETS = {
    "BTC": {"mu": 0.50, "sigma": 0.70, "start": 42000},
    "ETH": {"mu": 0.60, "sigma": 0.85, "start": 2200},
    "SOL": {"mu": 0.80, "sigma": 1.20, "start": 100},
    "BNB": {"mu": 0.40, "sigma": 0.80, "start": 320},
    "ADA": {"mu": 0.30, "sigma": 0.90, "start": 0.45},
}

N_DAYS = 365


def _generate_prices() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    end = datetime(2025, 5, 26)
    dates = [end - timedelta(days=N_DAYS - 1 - i) for i in range(N_DAYS)]

    series = {}
    for asset, p in ASSETS.items():
        daily_mu = p["mu"] / 252
        daily_sigma = p["sigma"] / np.sqrt(252)
        eps = rng.standard_normal(N_DAYS - 1)
        steps = np.exp((daily_mu - 0.5 * daily_sigma ** 2) + daily_sigma * eps)
        prices = np.empty(N_DAYS)
        prices[0] = p["start"]
        for i in range(1, N_DAYS):
            prices[i] = prices[i - 1] * steps[i - 1]
        series[asset] = prices

    return pd.DataFrame(series, index=dates)


PRICES = _generate_prices()


@app.route("/")
def index():
    return render_template("index.html", assets=list(ASSETS.keys()))


@app.route("/api/calculate", methods=["POST"])
def calculate():
    raw = request.get_json(force=True).get("weights", {})
    weights = {k: float(v) for k, v in raw.items() if float(v) > 0}
    if not weights:
        return jsonify({"error": "Select at least one asset"}), 400

    total = sum(weights.values())
    weights = {k: v / total for k, v in weights.items()}

    assets = list(weights.keys())
    w = np.array([weights[a] for a in assets])

    returns = PRICES[assets].pct_change().dropna()
    port_returns = (returns * w).sum(axis=1)

    vol = float(port_returns.std() * np.sqrt(252))
    var_95 = float(np.percentile(port_returns, 5))
    var_99 = float(np.percentile(port_returns, 1))

    cum_values = (1 + port_returns).cumprod() * 100

    return jsonify({
        "volatility": round(vol * 100, 2),
        "var_95": round(var_95 * 100, 2),
        "var_99": round(var_99 * 100, 2),
        "portfolio_values": [round(v, 3) for v in cum_values.tolist()],
        "dates": [d.strftime("%Y-%m-%d") for d in port_returns.index],
        "daily_returns": port_returns.tolist(),
        "normalized_weights": {k: round(v * 100, 1) for k, v in weights.items()},
    })


if __name__ == "__main__":
    app.run(debug=True)
