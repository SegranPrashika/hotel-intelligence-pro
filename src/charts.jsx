import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Doughnut, Bar, Line, Scatter } from 'react-chartjs-2';

ChartJS.register(
  ArcElement, BarElement, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler,
);

export const PALETTE = {
  positive: '#10b981', negative: '#f43f5e', neutral: '#94a3b8',
  accent: '#38bdf8', accent2: '#818cf8', warm: '#f59e0b', blue: '#3b82f6',
};

const GRID = 'rgba(255, 255, 255, 0.05)';
const TICK = '#94a3b8';
const baseTooltip = { 
  backgroundColor: '#0b1120', padding: 12, titleFont: { size: 13, weight: 'bold' }, 
  bodyFont: { size: 13 }, cornerRadius: 8, displayColors: true, borderColor: '#1e293b', borderWidth: 1
};

ChartJS.defaults.font.family = "'Inter', sans-serif";

export function DoughnutChart({ labels, values, colors, centerLabel, centerValue, height = 260 }) {
  return (
    <div className="chart-box" style={{ height }}>
      <Doughnut
        data={{ labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] }}
        options={{
          responsive: true, maintainAspectRatio: false, cutout: '75%',
          plugins: {
            legend: { position: 'bottom', labels: { color: TICK, padding: 20, font: { size: 12 } } },
            tooltip: { ...baseTooltip, callbacks: { label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
              return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${((ctx.parsed / total) * 100).toFixed(1)}%)`;
            } } },
          },
        }}
      />
      {centerValue !== undefined && (
        <div className="chart-center">
          <span className="chart-center-value">{centerValue}</span>
          {centerLabel && <span className="chart-center-label">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function BarChart({ labels, values, colors, horizontal = true, format, height = 260 }) {
  return (
    <div className="chart-box" style={{ height }}>
      <Bar
        data={{ labels, datasets: [{ data: values, backgroundColor: colors || PALETTE.accent, borderRadius: 4, borderSkipped: false }] }}
        options={{
          responsive: true, maintainAspectRatio: false,
          indexAxis: horizontal ? 'y' : 'x',
          scales: {
            x: { grid: { display: !horizontal, color: GRID, drawBorder: false }, ticks: { color: TICK, font: { size: 11 }, callback: (v) => (format ? format(v) : v) }, beginAtZero: true },
            y: { grid: { display: horizontal, color: GRID, drawBorder: false }, ticks: { color: TICK, font: { size: 11 }, autoSkip: false }, beginAtZero: !horizontal },
          },
          plugins: { legend: { display: false }, tooltip: { ...baseTooltip } },
        }}
      />
    </div>
  );
}

export function LineChart({ labels, series, height = 280, formatLeft, formatRight, yMaxLeft, yMaxRight }) {
  return (
    <div className="chart-box" style={{ height }}>
      <Line
        data={{
          labels,
          datasets: series.map((s) => ({
            label: s.label, data: s.values,
            borderColor: s.color,
            backgroundColor: s.fill ? s.color + '11' : s.color,
            fill: Boolean(s.fill), tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 6,
            yAxisID: s.axis || 'y',
          })),
        }}
        options={{
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { grid: { display: false }, ticks: { color: TICK, font: { size: 11 }, maxTicksLimit: 12 } },
            y: { position: 'left', beginAtZero: true, max: yMaxLeft, grid: { color: GRID, drawBorder: false }, ticks: { color: TICK, font: { size: 11 }, callback: (v) => (formatLeft ? formatLeft(v) : v) } },
            ...(series.some((s) => s.axis === 'y1') ? {
              y1: { position: 'right', beginAtZero: true, max: yMaxRight, grid: { display: false }, ticks: { color: PALETTE.accent2, font: { size: 11 }, callback: (v) => (formatRight ? formatRight(v) : v) } },
            } : {}),
          },
          plugins: {
            legend: { position: 'top', align: 'end', labels: { color: TICK, usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
            tooltip: { ...baseTooltip },
          },
        }}
      />
    </div>
  );
}

export function RocChart({ data, height = 300 }) {
  return (
    <div className="chart-box" style={{ height }}>
      <Scatter
        data={data}
        options={{
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { min: 0, max: 1, grid: { color: GRID, drawBorder: false }, ticks: { color: TICK }, title: { display: true, text: 'False Positive Rate', color: TICK } },
            y: { min: 0, max: 1, grid: { color: GRID, drawBorder: false }, ticks: { color: TICK }, title: { display: true, text: 'True Positive Rate', color: TICK } },
          },
          plugins: { legend: { position: 'bottom', labels: { color: TICK, usePointStyle: true } }, tooltip: { ...baseTooltip } },
        }}
      />
    </div>
  );
}