/* global Chart */

Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#21262d';
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

let valueChart = null;
let distChart  = null;

function getWeights() {
  const result = {};
  document.querySelectorAll('[data-asset]').forEach(inp => {
    result[inp.dataset.asset] = parseFloat(inp.value) || 0;
  });
  return result;
}

function setEqual() {
  const inputs = document.querySelectorAll('[data-asset]');
  const n = inputs.length;
  const share = Math.round(100 / n);
  inputs.forEach((inp, i) => {
    inp.value = i < n - 1 ? share : 100 - share * (n - 1);
  });
  updateWarning();
}

function clearAll() {
  document.querySelectorAll('[data-asset]').forEach(inp => { inp.value = 0; });
  updateWarning();
}

function updateWarning() {
  const total = Object.values(getWeights()).reduce((a, b) => a + b, 0);
  const warn  = document.getElementById('weight-warning');
  const sum   = document.getElementById('weight-sum');
  if (total > 0 && Math.round(total) !== 100) {
    sum.textContent = total.toFixed(0);
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

document.querySelectorAll('[data-asset]').forEach(inp => {
  inp.addEventListener('input', updateWarning);
});

async function calculate() {
  const weights = getWeights();
  const btn = document.getElementById('calc-btn');
  btn.textContent = 'Calculating…';
  btn.disabled = true;

  try {
    const res  = await fetch('/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights }),
    });
    const data = await res.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    renderMetrics(data);
    renderValueChart(data);
    renderDistChart(data);

    document.getElementById('metrics').style.display = 'grid';
    document.getElementById('charts').style.display  = 'grid';
  } catch (err) {
    alert('Request failed: ' + err.message);
  } finally {
    btn.textContent = 'Calculate Risk';
    btn.disabled = false;
  }
}

function renderMetrics(data) {
  document.getElementById('m-vol').textContent   = data.volatility.toFixed(1) + '%';
  document.getElementById('m-var95').textContent = data.var_95.toFixed(2) + '%';
  document.getElementById('m-var99').textContent = data.var_99.toFixed(2) + '%';
}

function renderValueChart(data) {
  const ctx = document.getElementById('valueChart').getContext('2d');
  if (valueChart) valueChart.destroy();

  // Thin out labels to ~10 evenly-spaced ticks
  const step = Math.max(1, Math.floor(data.dates.length / 10));
  const labels = data.dates.map((d, i) => i % step === 0 ? d.slice(0, 7) : '');

  valueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: data.portfolio_values,
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167,139,250,0.07)',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.25,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => data.dates[ctx[0].dataIndex],
            label: ctx => ' Portfolio: ' + ctx.parsed.y.toFixed(1),
          },
        },
      },
      scales: {
        x: { ticks: { maxRotation: 0 } },
        y: { ticks: { callback: v => v.toFixed(0) } },
      },
    },
  });
}

function renderDistChart(data) {
  const ctx = document.getElementById('distChart').getContext('2d');
  if (distChart) distChart.destroy();

  const returns  = data.daily_returns;
  const n_bins   = 40;
  const minR     = Math.min(...returns);
  const maxR     = Math.max(...returns);
  const binWidth = (maxR - minR) / n_bins;

  const counts   = new Array(n_bins).fill(0);
  returns.forEach(r => {
    const idx = Math.min(Math.floor((r - minR) / binWidth), n_bins - 1);
    counts[idx]++;
  });

  const edgesPct = Array.from({ length: n_bins }, (_, i) =>
    ((minR + i * binWidth) * 100).toFixed(1) + '%'
  );

  const var99 = data.var_99 / 100;
  const var95 = data.var_95 / 100;

  const colors = Array.from({ length: n_bins }, (_, i) => {
    const edge = minR + i * binWidth;
    if (edge < var99) return 'rgba(248,81,73,0.85)';
    if (edge < var95) return 'rgba(248,81,73,0.38)';
    return 'rgba(167,139,250,0.5)';
  });

  distChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: edgesPct,
      datasets: [{
        data: counts,
        backgroundColor: colors,
        borderWidth: 0,
        barPercentage: 1.0,
        categoryPercentage: 1.0,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => 'Return: ' + ctx[0].label,
            label: ctx => ' Days: ' + ctx.parsed.y,
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { ticks: { stepSize: 5 } },
      },
    },
  });
}

// Default: run BTC-only on page load
calculate();
