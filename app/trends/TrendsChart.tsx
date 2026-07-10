"use client";

import { useEffect, useRef, useState } from "react";
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
  const [themeTick, setThemeTick] = useState(0);

  // Rebuild the chart when the system theme flips so it re-reads the tokens.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setThemeTick((t) => t + 1);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Colors come from the same CSS tokens the rest of the site uses.
    const styles = getComputedStyle(document.documentElement);
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const ink = token("--ink");
    const muted = token("--ink-muted");
    const grid = token("--line-soft");
    const panel = token("--panel");
    const line = token("--line");
    const electric = token("--accent");
    const flame = token("--warn");
    const mono = token("--font-ledger") || "ui-monospace, monospace";

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
            label: "Gas",
            data: gas,
            borderColor: flame,
            backgroundColor: flame,
            borderWidth: 2,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            fill: false,
            tension: 0.3,
          },
          {
            label: "Electric",
            data: elec,
            borderColor: electric,
            backgroundColor: electric,
            borderWidth: 2,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            fill: false,
            tension: 0.3,
          },
          {
            label: "Gas (last year)",
            data: gasLY,
            borderColor: flame + "66",
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.3,
          },
          {
            label: "Electric (last year)",
            data: elecLY,
            borderColor: electric + "66",
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
              color: ink,
              usePointStyle: true,
              pointStyle: "line",
              padding: 20,
              font: { size: 12, family: mono },
            },
          },
          tooltip: {
            backgroundColor: panel,
            titleColor: ink,
            bodyColor: ink,
            borderColor: line,
            borderWidth: 1,
            padding: 12,
            cornerRadius: 6,
            titleFont: { family: mono },
            bodyFont: { family: mono },
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
              color: muted,
              maxRotation: isMobile ? 45 : 0,
              font: { size: isMobile ? 10 : 11, family: mono },
            },
            grid: { color: grid },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: muted,
              font: { size: 11, family: mono },
              callback: (v) =>
                "$" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }),
            },
            grid: { color: grid },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [rawLabels, gas, elec, gasLY, elecLY, themeTick]);

  return <canvas ref={canvasRef} />;
}
