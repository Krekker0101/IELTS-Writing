import React, { useState } from 'react';
import { Maximize2, X, ImageOff } from 'lucide-react';
import type { ChartSpec, WritingTask } from '../types/ielts';

interface TaskVisualProps {
  task: WritingTask;
}

export const TaskVisual: React.FC<TaskVisualProps> = ({ task }) => {
  const [zoomed, setZoomed] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!task.chartSpec && !task.imageUrl) {
    return null;
  }

  return (
    <div className="mt-5">
      {task.chartSpec && <ChartRenderer spec={task.chartSpec} />}

      {task.imageUrl && (
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
          {!imgError ? (
            <div className="relative group">
              <img
                src={task.imageUrl}
                alt={task.title}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-auto max-h-[380px] object-contain bg-white p-2"
              />
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/95 text-slate-800 border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Увеличить
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-6 bg-slate-50 text-slate-500 text-center">
              <ImageOff className="w-7 h-7 mb-2 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">{task.title}</p>
              <p className="text-xs text-slate-500 mt-1">
                Изображение временно недоступно для отображения.
              </p>
            </div>
          )}
        </div>
      )}

      {zoomed && task.imageUrl && !imgError && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-6"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
          aria-label={task.title}
        >
          <div
            className="relative max-w-5xl w-full bg-white rounded-2xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-900 truncate pr-4">
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => setZoomed(false)}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={task.imageUrl}
              alt={task.title}
              referrerPolicy="no-referrer"
              className="w-full max-h-[78vh] object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
};

const ChartRenderer: React.FC<{ spec: ChartSpec }> = ({ spec }) => {
  const [hovered, setHovered] = useState<{ label: string; value: string } | null>(null);

  if (spec.kind === 'table' && spec.tableHeaders && spec.tableRows) {
    return (
      <div className="border border-slate-200 rounded-xl bg-white p-5">
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-slate-900">{spec.title}</h4>
          {spec.subtitle && <p className="text-xs text-slate-500 mt-0.5">{spec.subtitle}</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {spec.tableHeaders.map((h, i) => (
                  <th
                    key={h}
                    className={`py-2.5 px-3 font-semibold text-slate-700 text-xs ${
                      i === 0 ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.tableRows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={`py-2.5 px-3 text-slate-800 ${
                        cIdx === 0 ? 'text-left font-medium' : 'text-right font-mono tabular-nums text-xs'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (spec.kind === 'pie' && spec.pieSlices) {
    return (
      <div className="border border-slate-200 rounded-xl bg-white p-5">
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-900">{spec.title}</h4>
          {spec.subtitle && <p className="text-xs text-slate-500 mt-0.5">{spec.subtitle}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
          <SinglePie title={spec.secondaryPie ? '1990' : spec.title} slices={spec.pieSlices} />
          {spec.secondaryPie && (
            <SinglePie title={spec.secondaryPie.title} slices={spec.secondaryPie.slices} />
          )}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-x-5 gap-y-2">
          {spec.pieSlices.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-xs text-slate-700">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Bar, Line, or Mixed chart in SVG
  const width = 560;
  const height = 270;
  const pad = { top: 20, right: spec.kind === 'mixed' ? 46 : 20, bottom: 38, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const primarySeries =
    spec.kind === 'mixed'
      ? spec.series.filter((s) => s.type !== 'line')
      : spec.series;
  const lineSeriesMixed =
    spec.kind === 'mixed'
      ? spec.series.filter((s) => s.type === 'line')
      : [];

  const maxPrimaryRaw = Math.max(
    10,
    ...primarySeries.flatMap((s) => s.values)
  );
  const maxPrimary = Math.ceil(maxPrimaryRaw * 1.15);
  const cats = spec.categories;

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{spec.title}</h4>
          {spec.subtitle && <p className="text-xs text-slate-500 mt-0.5">{spec.subtitle}</p>}
        </div>
        {hovered && (
          <div className="text-xs font-mono tabular-nums text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md whitespace-nowrap">
            {hovered.label}: {hovered.value}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label={spec.title}
      >
        {/* Horizontal Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.top + plotH * (1 - t);
          const val = Math.round(maxPrimary * t);
          return (
            <g key={t}>
              <line
                x1={pad.left}
                y1={y}
                x2={width - pad.right}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[10px] font-mono"
              >
                {val}{spec.unit === '%' ? '%' : ''}
              </text>
            </g>
          );
        })}

        {/* Secondary Y-axis for Mixed Chart (%) */}
        {spec.kind === 'mixed' &&
          [0, 25, 50, 75, 100].map((pct) => {
            const y = pad.top + plotH * (1 - pct / 100);
            return (
              <text
                key={pct}
                x={width - pad.right + 8}
                y={y + 4}
                textAnchor="start"
                className="fill-amber-700 text-[10px] font-mono"
              >
                {pct}%
              </text>
            );
          })}

        {/* Bars for bar or mixed */}
        {(spec.kind === 'bar' || spec.kind === 'mixed') &&
          cats.map((cat, cIdx) => {
            const groupW = plotW / cats.length;
            const barSeries = primarySeries;
            const barW = Math.min(28, (groupW * 0.7) / Math.max(1, barSeries.length));
            const totalBarsW = barW * barSeries.length + (barSeries.length - 1) * 3;
            const startX = pad.left + cIdx * groupW + (groupW - totalBarsW) / 2;

            return (
              <g key={cat}>
                {barSeries.map((s, sIdx) => {
                  const val = s.values[cIdx] ?? 0;
                  const barH = (val / maxPrimary) * plotH;
                  const x = startX + sIdx * (barW + 3);
                  const y = pad.top + plotH - barH;
                  return (
                    <g key={s.name}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={barH}
                        rx={2}
                        fill={s.color}
                        className="transition-opacity hover:opacity-80 cursor-pointer"
                        onMouseEnter={() =>
                          setHovered({
                            label: `${cat} · ${s.name}`,
                            value: `${val}${spec.unit ?? ''}`,
                          })
                        }
                        onMouseLeave={() => setHovered(null)}
                      />
                      <text
                        x={x + barW / 2}
                        y={y - 4}
                        textAnchor="middle"
                        className="fill-slate-600 text-[9px] font-mono"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={pad.left + cIdx * groupW + groupW / 2}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-slate-600 text-[11px]"
                >
                  {cat}
                </text>
              </g>
            );
          })}

        {/* Lines for line chart */}
        {spec.kind === 'line' && (
          <g>
            {cats.map((cat, idx) => {
              const x = pad.left + (idx / Math.max(1, cats.length - 1)) * plotW;
              return (
                <text
                  key={cat}
                  x={x}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-slate-600 text-[11px] font-mono"
                >
                  {cat}
                </text>
              );
            })}

            {spec.series.map((s) => {
              const pts = s.values.map((v, i) => {
                const x = pad.left + (i / Math.max(1, cats.length - 1)) * plotW;
                const y = pad.top + plotH - (v / maxPrimary) * plotH;
                return { x, y, v, cat: cats[i] };
              });
              const d = pts
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                .join(' ');
              return (
                <g key={s.name}>
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} />
                  {pts.map((p, i) => (
                    <g key={i}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        fill="#ffffff"
                        stroke={s.color}
                        strokeWidth={2}
                        className="cursor-pointer"
                        onMouseEnter={() =>
                          setHovered({
                            label: `${p.cat} · ${s.name}`,
                            value: `${p.v}${spec.unit ?? ''}`,
                          })
                        }
                        onMouseLeave={() => setHovered(null)}
                      />
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
        )}

        {/* Overlay Line for Mixed Chart */}
        {spec.kind === 'mixed' &&
          lineSeriesMixed.map((s) => {
            const groupW = plotW / cats.length;
            const pts = s.values.map((v, i) => {
              const x = pad.left + i * groupW + groupW / 2;
              const y = pad.top + plotH - (v / 100) * plotH;
              return { x, y, v, cat: cats[i] };
            });
            const d = pts
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
              .join(' ');
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} />
                {pts.map((p, i) => (
                  <g key={i}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={4}
                      fill="#ffffff"
                      stroke={s.color}
                      strokeWidth={2}
                      className="cursor-pointer"
                      onMouseEnter={() =>
                        setHovered({
                          label: `${p.cat} · ${s.name}`,
                          value: `${p.v}%`,
                        })
                      }
                      onMouseLeave={() => setHovered(null)}
                    />
                    <text
                      x={p.x}
                      y={p.y - 8}
                      textAnchor="middle"
                      className="fill-amber-700 text-[9px] font-mono font-semibold"
                    >
                      {p.v}%
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
      </svg>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-5 gap-y-2">
        {spec.series.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-xs text-slate-700">
            <span
              className="w-3 h-1.5 rounded-sm shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SinglePie: React.FC<{ title: string; slices: { label: string; value: number; color: string }[] }> = ({
  title,
  slices,
}) => {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 100;
  let cumulative = 0;
  const cx = 80;
  const cy = 80;
  const r = 64;

  const paths = slices.map((slice) => {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += slice.value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const midAngle = (startAngle + endAngle) / 2;
    const lx = cx + r * 0.65 * Math.cos(midAngle);
    const ly = cy + r * 0.65 * Math.sin(midAngle);
    const d = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(
      2
    )} ${y2.toFixed(2)} Z`;

    return { d, lx, ly, slice };
  });

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold text-slate-700 mb-2">{title}</p>
      <svg viewBox="0 0 160 160" className="w-40 h-40">
        {paths.map((p) => (
          <g key={p.slice.label}>
            <path d={p.d} fill={p.slice.color} stroke="#ffffff" strokeWidth={1.5} />
            {p.slice.value >= 10 && (
              <text
                x={p.lx}
                y={p.ly + 3}
                textAnchor="middle"
                className="fill-white text-[9px] font-mono font-semibold"
              >
                {p.slice.value}%
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};
