
import { useMemo } from 'react'
import './AdminChart.css'

function AdminChart({ failedLogins = [] }) {
  const chartData = useMemo(() => {
    const today = new Date()
    const days = []

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(today.getDate() - i)
      date.setHours(0, 0, 0, 0)

      days.push({
        date,
        label: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        count: 0,
      })
    }

    failedLogins.forEach((attempt) => {
      const attemptDate = new Date(attempt.attempted_at)

      if (Number.isNaN(attemptDate.getTime())) return

      attemptDate.setHours(0, 0, 0, 0)

      const day = days.find(
        (item) => item.date.getTime() === attemptDate.getTime()
      )

      if (day) day.count += 1
    })

    return days
  }, [failedLogins])

  const maxValue = Math.max(
    5,
    Math.ceil(Math.max(...chartData.map((item) => item.count)) / 5) * 5
  )

  const chartHeight = 230
  const chartWidth = 760
  const left = 48
  const right = 15
  const top = 20
  const bottom = 38

  const plotWidth = chartWidth - left - right
  const plotHeight = chartHeight - top - bottom

  const points = chartData.map((item, index) => ({
    ...item,
    x: left + (index / 6) * plotWidth,
    y: top + plotHeight - (item.count / maxValue) * plotHeight,
  }))

  const linePath = points
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    )
    .join(' ')

  const areaPath = `${linePath} L ${points[6].x} ${top + plotHeight} L ${points[0].x} ${top + plotHeight} Z`

  const totalAttempts = chartData.reduce(
    (sum, item) => sum + item.count,
    0
  )

  const peak = Math.max(...chartData.map((item) => item.count))

  return (
    <div className="admin-chart-card">
      <div className="admin-chart-header">
        <div>
          <h3>Failed Login Activity</h3>
          <p>Daily failed login attempts over the last 7 days</p>
        </div>

        <span className="admin-chart-period">Last 7 Days</span>
      </div>

      <div className="admin-chart-summary">
        <div>
          <span className="chart-summary-dot" />
          <span>Total Attempts</span>
          <strong>{totalAttempts}</strong>
        </div>

        <div>
          <span>Peak in one day</span>
          <strong>{peak}</strong>
        </div>
      </div>

      {totalAttempts === 0 ? (
        <div className="admin-chart-empty">
          <div>✓</div>
          <strong>No failed login activity</strong>
          <p>No failed login attempts recorded in the last 7 days.</p>
        </div>
      ) : (
        <div className="admin-chart-scroll">
          <svg
            className="admin-line-chart"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label="Failed login attempts over the last seven days"
          >
            <defs>
              <linearGradient id="failedAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef5364" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#ef5364" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {Array.from({ length: 5 }, (_, index) => {
              const value = (maxValue / 4) * (4 - index)
              const y = top + (plotHeight / 4) * index

              return (
                <g key={index}>
                  <line
                    x1={left}
                    y1={y}
                    x2={chartWidth - right}
                    y2={y}
                    className="chart-grid-line"
                  />
                  <text
                    x={left - 12}
                    y={y + 4}
                    textAnchor="end"
                    className="chart-axis-label"
                  >
                    {Math.round(value)}
                  </text>
                </g>
              )
            })}

            <path d={areaPath} fill="url(#failedAreaGradient)" />

            <path
              d={linePath}
              fill="none"
              stroke="#ef5364"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {points.map((point, index) => (
              <g key={index}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="9"
                  fill="#ef5364"
                  opacity="0.12"
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="#ffffff"
                  stroke="#ef5364"
                  strokeWidth="2.5"
                >
                  <title>
                    {point.label}: {point.count} failed attempts
                  </title>
                </circle>

                <text
                  x={point.x}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  className="chart-axis-label"
                >
                  {point.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      <div className="admin-chart-legend">
        <span />
        Failed Login Attempts
      </div>
    </div>
  )
}

export default AdminChart
