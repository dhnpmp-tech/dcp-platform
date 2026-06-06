'use client'

import React, { useState, useMemo, useCallback } from 'react'

interface InteractiveTableProps {
  headers: string[]
  rows: string[][]
}

type SortDir = 'asc' | 'desc' | null

function parseNumeric(val: string): number | null {
  const cleaned = val.replace(/[,%]/g, '').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function isNumericColumn(rows: string[][], colIndex: number): boolean {
  let numCount = 0
  for (const row of rows) {
    if (colIndex < row.length && parseNumeric(row[colIndex]) !== null) numCount++
  }
  return numCount > rows.length * 0.5
}

function isHigherBetter(header: string): boolean {
  const lower = header.toLowerCase()
  if (lower.includes('latency') || lower.includes('cost') || lower.includes('cold start') || lower.includes('vram') || lower.includes('price') || lower.includes('error')) return false
  if (lower.includes('mmlu') || lower.includes('qa') || lower.includes('score') || lower.includes('accuracy') || lower.includes('quality')) return true
  return true
}

// Assign a color to each selected model
const MODEL_COLORS = [
  '#2dd4b6', // dc1 accent (v2 teal)
  '#10b981', // emerald
  '#f59e0b', // amber
  '#a78bfa', // violet
  '#f472b6', // pink
  '#fb923c', // orange
  '#38bdf8', // sky
  '#34d399', // teal
]

export default function InteractiveTable({ headers, rows }: InteractiveTableProps) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pinnedMetric, setPinnedMetric] = useState<number | null>(null)

  const numericCols = useMemo(() => {
    const result: Record<number, boolean> = {}
    headers.forEach((_, i) => { result[i] = isNumericColumn(rows, i) })
    return result
  }, [headers, rows])

  const colStats = useMemo(() => {
    const stats: Record<number, { min: number; max: number; higherBetter: boolean }> = {}
    headers.forEach((h, i) => {
      if (!numericCols[i]) return
      const vals = rows.map(r => parseNumeric(r[i] || '')).filter((v): v is number => v !== null)
      if (vals.length === 0) return
      stats[i] = { min: Math.min(...vals), max: Math.max(...vals), higherBetter: isHigherBetter(h) }
    })
    return stats
  }, [headers, rows, numericCols])

  // Rank each model for each numeric column
  const colRanks = useMemo(() => {
    const ranks: Record<number, Record<number, number>> = {}
    headers.forEach((_, ci) => {
      if (!colStats[ci]) return
      const indexed = rows.map((r, ri) => ({ ri, val: parseNumeric(r[ci] || '') })).filter(e => e.val !== null) as { ri: number; val: number }[]
      indexed.sort((a, b) => colStats[ci].higherBetter ? b.val - a.val : a.val - b.val)
      ranks[ci] = {}
      indexed.forEach((e, rank) => { ranks[ci][e.ri] = rank + 1 })
    })
    return ranks
  }, [rows, headers, colStats])

  // Compute overall rank (average rank across all numeric columns)
  const overallRanks = useMemo(() => {
    const numCols = Object.keys(colRanks).map(Number)
    if (numCols.length === 0) return rows.map((_, i) => i + 1)
    return rows.map((_, ri) => {
      const rankSum = numCols.reduce((sum, ci) => sum + (colRanks[ci]?.[ri] || rows.length), 0)
      return rankSum / numCols.length
    })
  }, [rows, colRanks])

  const sortedRows = useMemo(() => {
    const indexed = rows.map((row, i) => ({ row, originalIndex: i }))
    if (sortCol === null || sortDir === null) {
      // Default sort by overall rank
      return [...indexed].sort((a, b) => overallRanks[a.originalIndex] - overallRanks[b.originalIndex])
    }
    return [...indexed].sort((a, b) => {
      const aVal = a.row[sortCol] || ''
      const bVal = b.row[sortCol] || ''
      const aNum = parseNumeric(aVal)
      const bNum = parseNumeric(bVal)
      if (aNum !== null && bNum !== null) return sortDir === 'asc' ? aNum - bNum : bNum - aNum
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })
  }, [rows, sortCol, sortDir, overallRanks])

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return sortedRows
    const q = searchQuery.toLowerCase()
    return sortedRows.filter(({ row }) => row.some(cell => cell.toLowerCase().includes(q)))
  }, [sortedRows, searchQuery])

  const handleSort = useCallback((colIndex: number) => {
    if (sortCol === colIndex) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortCol(null); setSortDir(null) }
      else setSortDir('asc')
    } else {
      setSortCol(colIndex)
      setSortDir('asc')
    }
  }, [sortCol, sortDir])

  const toggleRow = useCallback((originalIndex: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(originalIndex)) next.delete(originalIndex)
      else next.add(originalIndex)
      return next
    })
  }, [])

  const getSelectedColor = (originalIndex: number): string => {
    const arr = Array.from(selectedRows)
    const idx = arr.indexOf(originalIndex)
    return idx >= 0 ? MODEL_COLORS[idx % MODEL_COLORS.length] : MODEL_COLORS[0]
  }

  const isBestValue = (ci: number, value: string): boolean => {
    const s = colStats[ci]; if (!s) return false
    const n = parseNumeric(value); if (n === null) return false
    return s.higherBetter ? n === s.max : n === s.min
  }

  const isWorstValue = (ci: number, value: string): boolean => {
    const s = colStats[ci]; if (!s) return false
    const n = parseNumeric(value); if (n === null) return false
    return s.higherBetter ? n === s.min : n === s.max
  }

  const getBarWidth = (ci: number, value: string): number => {
    const s = colStats[ci]; if (!s) return 0
    const n = parseNumeric(value); if (n === null) return 0
    if (s.max === s.min) return 100
    return ((n - s.min) / (s.max - s.min)) * 100
  }

  const getGoodness = (ci: number, value: string): number => {
    const s = colStats[ci]; if (!s) return 0.5
    const n = parseNumeric(value); if (n === null) return 0.5
    const ratio = s.max === s.min ? 1 : (n - s.min) / (s.max - s.min)
    return s.higherBetter ? ratio : 1 - ratio
  }

  const getBarColor = (ci: number, value: string): string => {
    const g = getGoodness(ci, value)
    if (g > 0.7) return 'rgba(16, 185, 129, 0.25)'
    if (g > 0.4) return 'rgba(0, 240, 255, 0.15)'
    return 'rgba(245, 158, 11, 0.18)'
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', cls: 'text-yellow-400' }
    if (rank === 2) return { emoji: '🥈', cls: 'text-gray-300' }
    if (rank === 3) return { emoji: '🥉', cls: 'text-amber-600' }
    return { emoji: `#${rank}`, cls: 'text-dc1-text-muted' }
  }

  // Radar chart data for selected models
  const radarMetrics = useMemo(() => {
    return headers
      .map((h, i) => ({ header: h, index: i }))
      .filter(({ index }) => numericCols[index] && colStats[index])
  }, [headers, numericCols, colStats])

  const renderRadarChart = () => {
    if (selectedRows.size < 2 || radarMetrics.length < 3) return null
    const cx = 160, cy = 160, radius = 120
    const angleStep = (2 * Math.PI) / radarMetrics.length
    const selectedArr = Array.from(selectedRows)

    // Grid rings
    const rings = [0.25, 0.5, 0.75, 1.0]

    return (
      <div className="flex flex-col items-center">
        <svg width="320" height="340" viewBox="0 0 320 340" className="drop-shadow-lg">
          {/* Background */}
          <circle cx={cx} cy={cy} r={radius + 20} fill="rgba(11, 18, 33, 0.8)" />

          {/* Grid rings */}
          {rings.map(r => (
            <polygon
              key={`ring-${r}`}
              points={radarMetrics.map((_, i) => {
                const angle = i * angleStep - Math.PI / 2
                return `${cx + radius * r * Math.cos(angle)},${cy + radius * r * Math.sin(angle)}`
              }).join(' ')}
              fill="none"
              stroke="rgba(30, 41, 59, 0.6)"
              strokeWidth="1"
            />
          ))}

          {/* Axis lines */}
          {radarMetrics.map((_, i) => {
            const angle = i * angleStep - Math.PI / 2
            return (
              <line
                key={`axis-${i}`}
                x1={cx} y1={cy}
                x2={cx + radius * Math.cos(angle)}
                y2={cy + radius * Math.sin(angle)}
                stroke="rgba(30, 41, 59, 0.4)"
                strokeWidth="1"
              />
            )
          })}

          {/* Model polygons */}
          {selectedArr.map((rowIdx, si) => {
            const color = MODEL_COLORS[si % MODEL_COLORS.length]
            const points = radarMetrics.map((m, i) => {
              const angle = i * angleStep - Math.PI / 2
              const val = parseNumeric(rows[rowIdx][m.index] || '') ?? 0
              const s = colStats[m.index]
              const normalized = s && s.max !== s.min
                ? (s.higherBetter
                    ? (val - s.min) / (s.max - s.min)
                    : 1 - (val - s.min) / (s.max - s.min))
                : 0.5
              const r = Math.max(normalized, 0.05) * radius
              return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
            }).join(' ')

            return (
              <g key={`model-${rowIdx}`}>
                <polygon
                  points={points}
                  fill={color}
                  fillOpacity="0.1"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                {/* Dots at vertices */}
                {radarMetrics.map((m, i) => {
                  const angle = i * angleStep - Math.PI / 2
                  const val = parseNumeric(rows[rowIdx][m.index] || '') ?? 0
                  const s = colStats[m.index]
                  const normalized = s && s.max !== s.min
                    ? (s.higherBetter
                        ? (val - s.min) / (s.max - s.min)
                        : 1 - (val - s.min) / (s.max - s.min))
                    : 0.5
                  const r = Math.max(normalized, 0.05) * radius
                  return (
                    <circle
                      key={`dot-${rowIdx}-${i}`}
                      cx={cx + r * Math.cos(angle)}
                      cy={cy + r * Math.sin(angle)}
                      r="3.5"
                      fill={color}
                      stroke="#0b1221"
                      strokeWidth="1.5"
                    />
                  )
                })}
              </g>
            )
          })}

          {/* Axis labels */}
          {radarMetrics.map((m, i) => {
            const angle = i * angleStep - Math.PI / 2
            const labelR = radius + 16
            const x = cx + labelR * Math.cos(angle)
            const y = cy + labelR * Math.sin(angle)
            const short = m.header.replace(/\s*\(.*\)/, '').replace('Cost / 1K tokens', 'Cost/1K')
            return (
              <text
                key={`label-${i}`}
                x={x} y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-dc1-text-muted"
                fontSize="9"
                fontWeight="500"
              >
                {short}
              </text>
            )
          })}
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {selectedArr.map((rowIdx, si) => (
            <div key={`legend-${rowIdx}`} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: MODEL_COLORS[si % MODEL_COLORS.length] }}
              />
              <span className="text-xs text-dc1-text-secondary">{rows[rowIdx][0]}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="my-8 space-y-4 max-w-full">
      {/* Header toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-dc1-surface-l2/60 border border-dc1-border">
            <svg className="w-3.5 h-3.5 text-dc1-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-dc1-text-primary placeholder:text-dc1-text-muted outline-none w-32"
            />
          </div>
          <span className="text-[11px] text-dc1-text-muted tracking-wider">
            {filteredRows.length} of {rows.length} models
          </span>
          {selectedRows.size > 0 && (
            <button
              onClick={() => setSelectedRows(new Set())}
              className="text-[11px] px-2 py-0.5 rounded bg-dc1-surface-l3 text-dc1-amber hover:bg-dc1-surface-l2 transition-colors border border-dc1-border/50"
            >
              Clear ({selectedRows.size})
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 text-[10px] text-dc1-text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500/70" /> Best in class
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500/70" /> Needs improvement
          </span>
          <span>Click rows to compare</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-dc1-border bg-dc1-surface-l1/50 shadow-xl max-w-full">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-dc1-surface-l2/80 backdrop-blur">
              <th className="w-8 px-1 py-2 text-center text-[10px] text-dc1-text-muted font-medium">#</th>
              <th className="w-6 px-0.5 py-2" />
              {headers.map((h, i) => (
                <th
                  key={`th-${i}`}
                  onClick={() => handleSort(i)}
                  className={`px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap group transition-colors ${
                    pinnedMetric === i ? 'text-dc1-text-primary bg-dc1-amber/[0.05]' : 'text-dc1-amber hover:text-dc1-text-primary'
                  }`}
                  onDoubleClick={() => setPinnedMetric(pinnedMetric === i ? null : i)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {h}
                    <span className="text-dc1-text-muted group-hover:text-dc1-amber transition-colors text-[10px]">
                      {sortCol === i ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ row, originalIndex }, ri) => {
              const isSelected = selectedRows.has(originalIndex)
              const isHovered = hoveredRow === originalIndex
              const avgRank = overallRanks[originalIndex]
              const displayRank = Math.round(avgRank)
              const badge = getRankBadge(displayRank)
              const selColor = isSelected ? getSelectedColor(originalIndex) : null

              return (
                <tr
                  key={`tr-${originalIndex}`}
                  onClick={() => toggleRow(originalIndex)}
                  onMouseEnter={() => setHoveredRow(originalIndex)}
                  onMouseLeave={() => setHoveredRow(null)}
                  className={`
                    cursor-pointer transition-all duration-150 border-b border-dc1-border/20
                    ${isSelected
                      ? 'bg-dc1-surface-l2/40'
                      : isHovered
                        ? 'bg-dc1-surface-l2/50'
                        : ri % 2 === 0 ? 'bg-transparent' : 'bg-dc1-surface-l2/10'
                    }
                  `}
                  style={isSelected ? { borderLeft: `3px solid ${selColor}` } : undefined}
                >
                  {/* Rank */}
                  <td className="w-8 px-1 py-1.5 text-center">
                    <span className={`text-xs font-mono ${badge.cls}`}>
                      {displayRank <= 3 ? badge.emoji : badge.emoji}
                    </span>
                  </td>
                  {/* Checkbox */}
                  <td className="w-6 px-0.5 py-1.5 text-center">
                    <span
                      className={`
                        inline-flex w-4 h-4 items-center justify-center rounded transition-all text-[10px]
                        ${isSelected
                          ? 'border-2 text-white'
                          : 'border border-dc1-border text-transparent hover:border-dc1-text-muted'
                        }
                      `}
                      style={isSelected ? { borderColor: selColor || '#2dd4b6', backgroundColor: `${selColor}33` } : undefined}
                    >
                      {isSelected ? '✓' : ''}
                    </span>
                  </td>
                  {row.map((cell, ci) => {
                    const best = isBestValue(ci, cell)
                    const worst = isWorstValue(ci, cell)
                    const isNum = numericCols[ci]
                    const barW = isNum ? getBarWidth(ci, cell) : 0
                    const barColor = isNum ? getBarColor(ci, cell) : ''
                    const rank = colRanks[ci]?.[originalIndex]
                    const isPinned = pinnedMetric === ci

                    return (
                      <td
                        key={`td-${originalIndex}-${ci}`}
                        className={`px-2 py-1.5 whitespace-nowrap relative overflow-hidden ${isPinned ? 'bg-dc1-amber/[0.03]' : ''}`}
                      >
                        {isNum && (
                          <div
                            className="absolute inset-y-0 left-0 transition-all duration-500"
                            style={{ width: `${barW}%`, backgroundColor: barColor }}
                          />
                        )}
                        <span className={`
                          relative z-10 text-xs inline-flex items-center gap-1
                          ${ci === 0
                            ? 'font-medium text-dc1-text-primary'
                            : best ? 'font-semibold text-emerald-400'
                            : worst ? 'text-amber-400/80'
                            : 'text-dc1-text-secondary'
                          }
                        `}>
                          {cell}
                          {best && <span className="text-[9px] px-1 py-px rounded bg-emerald-500/20 text-emerald-400 font-bold">BEST</span>}
                          {rank && rank <= 3 && !best && (
                            <span className="text-[9px] text-dc1-text-muted font-mono">#{rank}</span>
                          )}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Comparison panel with radar chart */}
      {selectedRows.size >= 2 && (
        <div className="rounded-xl border border-dc1-amber/20 bg-gradient-to-b from-dc1-surface-l1 to-dc1-surface-l2/50 p-6 space-y-6 animate-fade-in shadow-amber">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold tracking-wide text-dc1-amber flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Model Comparison — {selectedRows.size} selected
            </h4>
            <span className="text-[10px] text-dc1-text-muted">Double-click column header to pin</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar chart */}
            {radarMetrics.length >= 3 && (
              <div className="flex flex-col items-center justify-center">
                {renderRadarChart()}
              </div>
            )}

            {/* Bar comparison */}
            <div className="space-y-3">
              {headers.map((h, ci) => {
                if (ci === 0 || !numericCols[ci]) return null
                const stats = colStats[ci]
                if (!stats) return null
                const selectedEntries = rows
                  .map((r, i) => ({ name: r[0], value: r[ci], index: i }))
                  .filter(e => selectedRows.has(e.index))

                return (
                  <div key={`cmp-${ci}`} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-dc1-text-muted font-medium tracking-wider">{h}</span>
                      <span className="text-[9px] text-dc1-text-muted/70 uppercase">
                        {stats.higherBetter ? '↑ higher is better' : '↓ lower is better'}
                      </span>
                    </div>
                    {selectedEntries.map((entry, ei) => {
                      const num = parseNumeric(entry.value)
                      const barW = num !== null && stats.max !== stats.min
                        ? ((num - stats.min) / (stats.max - stats.min)) * 100 : 50
                      const best = isBestValue(ci, entry.value)
                      const color = getSelectedColor(entry.index)
                      return (
                        <div key={`cmp-${ci}-${entry.index}`} className="flex items-center gap-2">
                          <span className="text-[11px] text-dc1-text-secondary w-28 truncate flex-shrink-0">{entry.name}</span>
                          <div className="flex-1 h-4 bg-dc1-surface-l3/80 rounded-sm overflow-hidden relative">
                            <div
                              className="h-full rounded-sm transition-all duration-700"
                              style={{
                                width: `${Math.max(barW, 3)}%`,
                                backgroundColor: `${color}50`,
                                borderRight: `2px solid ${color}`,
                              }}
                            />
                          </div>
                          <span className={`text-[11px] font-mono w-16 text-right flex-shrink-0 ${best ? 'text-emerald-400 font-bold' : 'text-dc1-text-secondary'}`}>
                            {entry.value}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
