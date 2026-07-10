"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function TrendsChart({
  rawLabels,
  gas,
  elec,
  gasLY,
  elecLY,
}: {
  rawLabels: string[];
  gas: (number | null)[];
  elec: (number | null)[];
  gasLY: (number | null)[];
  elecLY: (number | null)[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const labels = rawLabels.map((l) => {
      const [y, m] = l.split("-");
      return `${monthNames[Number(m) - 1]} '${y.slice(2)}`;
    });
    const isMobile = window.innerWidth < 640;

    const chart = new Chart(canvas.getContext("2d")!, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "🔥 Gas",
            data: gas,
            borderColor: "#E2E8F0",
            backgroundColor: "rgba(226,232,240,0.12)",
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: false,
            tension: 0.3,
          },
          {
            label: "⚡ Electric",
            data: elec,
            borderColor: "#60A5FA",
            backgroundColor: "rgba(96,165,250,0.12)",
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: false,
            tension: 0.3,
          },
          {
            label: "🔥 Gas (last year)",
            data: gasLY,
            borderColor: "rgba(226,232,240,0.35)",
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.3,
          },
          {
            label: "⚡ Electric (last year)",
            data: elecLY,
            borderColor: "rgba(96,165,250,0.35)",
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "rgba(230,238,248,0.9)",
              usePointStyle: true,
              pointStyle: "line",
              padding: 20,
              font: { size: 13 },
            },
          },
          tooltip: {
            backgroundColor: "rgba(11,18,32,0.95)",
            titleColor: "#E6EEF8",
            bodyColor: "#E6EEF8",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            displayColors: true,
            callbacks: {
              label: (ctx) =>
                ctx.parsed.y !== null
                  ? ` ${ctx.dataset.label}:  $${Number(ctx.parsed.y).toFixed(2)}`
                  : "",
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "rgba(230,238,248,0.6)",
              maxRotation: isMobile ? 45 : 0,
              font: { size: isMobile ? 10 : 12 },
            },
            grid: { color: "rgba(255,255,255,0.04)" },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: "rgba(230,238,248,0.6)",
              font: { size: 12 },
              callback: (v) =>
                "$" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }),
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [rawLabels, gas, elec, gasLY, elecLY]);

  return <canvas ref={canvasRef} />;
}
