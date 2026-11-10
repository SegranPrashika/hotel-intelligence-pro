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
  positive: '#42c89a', negative: '#f0788a', neutral: '#9aa9bd',
  accent: '#55c6d6', accent2: '#a78bfa', warm: '#eab86c', blue: '#70a5f5',
};

const GRID = 'rgba(151, 172, 199, 0.13)';
const TICK = '#a1afc2';
const baseTooltip = {
  backgroundColor: '#111a29',
  padding: 12,
  titleFont: { size: 12, weight: 'bold' },
  bodyFont: { size: 12 },
  cornerRadius: 8,
  displayColors: true,
  borderColor: '#34445b',
  borderWidth: 1,
};

ChartJS.defaults.color = TICK;
ChartJS.defaults.font.family = 'Inter, "Segoe UI", sans-serif';
ChartJS.defaults.font.size = 11;
ChartJS.defaults.borderColor = GRID;

export function DoughnutChart({ labels, values, colors, centerLabel, centerValue, height = 260 }) {
  return (
    <div className="chart-box" style={{ height }}>
      <Doughnut
        data={{ labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 6, spacing: 2, borderRadius: 3 }] }}
        options={{
          responsive: true, maintainAspectRatio: false, cutout: '73%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: TICK, padding: 18, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, font: { size: 11 } },
            },
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
            x: { grid: { display: !horizontal, color: GRID, drawBorder: false }, ticks: { color: TICK, font: { size: 10 }, callback: (v) => (format ? format(v) : v), maxRotation: 0 }, beginAtZero: true },
            y: { grid: { display: horizontal, color: GRID, drawBorder: false }, ticks: { color: TICK, font: { size: 10 }, autoSkip: horizontal ? false : true, maxRotation: 0 }, beginAtZero: !horizontal },
          },
          layout: { padding: { top: 4, right: 8, bottom: 0, left: 4 } },
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
            backgroundColor: s.fill ? s.color + '18' : s.color,
            fill: Boolean(s.fill), tension: 0.32, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5,
            yAxisID: s.axis || 'y',
          })),
        }}
        options={{
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { grid: { display: false }, ticks: { color: TICK, font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 } },
            y: { position: 'left', beginAtZero: true, max: yMaxLeft, grid: { color: GRID, drawBorder: false }, ticks: { color: TICK, font: { size: 11 }, callback: (v) => (formatLeft ? formatLeft(v) : v) } },
            ...(series.some((s) => s.axis === 'y1') ? {
              y1: { position: 'right', beginAtZero: true, max: yMaxRight, grid: { display: false }, ticks: { color: PALETTE.accent2, font: { size: 11 }, callback: (v) => (formatRight ? formatRight(v) : v) } },
            } : {}),
          },
          plugins: {
            legend: { position: 'top', align: 'end', labels: { color: TICK, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14, font: { size: 11 } } },
            tooltip: { ...baseTooltip },
          },
        }}
      />
    </div>
  );
}

export function RocChart({
  data,
  height = 300,
  xTitle = 'False Positive Rate',
  yTitle = 'True Positive Rate',
}) {
  return (
    <div className="chart-box" style={{ height }}>
      <Scatter
        data={data}
        options={{
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { min: 0, max: 1, grid: { color: GRID, drawBorder: false }, ticks: { color: TICK, font: { size: 10 } }, title: { display: true, text: xTitle, color: TICK, font: { size: 11, weight: '600' } } },
            y: { min: 0, max: 1, grid: { color: GRID, drawBorder: false }, ticks: { color: TICK, font: { size: 10 } }, title: { display: true, text: yTitle, color: TICK, font: { size: 11, weight: '600' } } },
          },
          layout: { padding: { top: 4, right: 8, bottom: 0, left: 4 } },
          plugins: { legend: { position: 'bottom', labels: { color: TICK, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14, font: { size: 10 } } }, tooltip: { ...baseTooltip } },
        }}
      />
    </div>
  );
}