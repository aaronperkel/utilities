<?php
// CSV export must happen BEFORE any HTML output
// Include DB connection only (not top.php which outputs HTML)
if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    // Start output buffering to catch any stray output from connect-DB.php
    ob_start();
    
    // Suppress display errors for CSV output
    ini_set('display_errors', 0);
    error_reporting(0);
    
    require_once dirname(__DIR__) . '/includes/connect-DB.php';
    
    // Fetch data for CSV
    $sql = "
      SELECT
        DATE_FORMAT(STR_TO_DATE(fldDate,'%Y-%m-%d'), '%Y-%m') AS month,
        fldItem,
        SUM(fldTotal) AS total
      FROM tblUtilities
      WHERE fldItem IN ('Gas','Electric')
      GROUP BY month, fldItem
      ORDER BY month
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Pivot into monthly array
    $monthly = [];
    foreach ($data as $r) {
        $m = $r['month'];
        if (!isset($monthly[$m])) {
            $monthly[$m] = ['Gas' => 0, 'Electric' => 0];
        }
        $monthly[$m][$r['fldItem']] = (float) $r['total'];
    }
    
    $labels = array_keys($monthly);
    
    // Limit to last 12 months for display (CSV exports all data though)
    // For CSV, we'll export all data - users can filter in Excel
    
    // Build last year data
    $lastYearGas = [];
    $lastYearElec = [];
    foreach ($labels as $label) {
        [$y, $m] = explode('-', $label);
        $lyKey = ($y - 1) . '-' . $m;
        $lastYearGas[] = isset($monthly[$lyKey]) ? $monthly[$lyKey]['Gas'] : '';
        $lastYearElec[] = isset($monthly[$lyKey]) ? $monthly[$lyKey]['Electric'] : '';
    }
    
    // Output CSV (full history)
    // Clean any buffered output (from connect-DB.php, etc.)
    ob_end_clean();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="utilities-trends.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['Month', 'Gas', 'Electric', 'Gas Last Year', 'Electric Last Year'], ',', '"', '');
    foreach ($labels as $i => $label) {
        $gasVal = $monthly[$label]['Gas'] ?? '';
        $elecVal = $monthly[$label]['Electric'] ?? '';
        fputcsv($out, [$label, $gasVal, $elecVal, $lastYearGas[$i], $lastYearElec[$i]], ',', '"', '');
    }
    fclose($out);
    exit;
}

require_once dirname(__DIR__) . '/includes/top.php';

// fetch monthly sums for Gas & Electric
$sql = "
  SELECT
    DATE_FORMAT(STR_TO_DATE(fldDate,'%Y-%m-%d'), '%Y-%m') AS month,
    fldItem,
    SUM(fldTotal) AS total
  FROM tblUtilities
  WHERE fldItem IN ('Gas','Electric')
  GROUP BY month, fldItem
  ORDER BY month
";
$stmt = $pdo->prepare($sql);
$stmt->execute();
$data = $stmt->fetchAll(PDO::FETCH_ASSOC);

// pivot into [month=>['Gas'=>..,'Electric'=>..]]
$monthly = [];
foreach ($data as $r) {
    $m = $r['month'];
    if (!isset($monthly[$m])) {
        $monthly[$m] = ['Gas' => 0, 'Electric' => 0];
    }
    $monthly[$m][$r['fldItem']] = (float) $r['total'];
}

$labels = array_keys($monthly);

// Limit to last 12 months
$labels = array_slice($labels, -12);

$gasData = array_map(fn($m) => $monthly[$m]['Gas'], $labels);
$elecData = array_map(fn($m) => $monthly[$m]['Electric'], $labels);

// --- Insights Data Calculation ---

// Initialize insight data arrays
$last_year_totals = ['Gas' => 'N/A', 'Electric' => 'N/A', 'Internet' => 'N/A'];
$forecast_totals = ['Gas' => 'N/A', 'Electric' => 'N/A', 'Internet' => 'N/A'];
$bill_items = ['Gas', 'Electric', 'Internet'];

// --- This Time Last Year ---
$current_year = date('Y');
$current_month = date('m');
$last_year = $current_year - 1;
$last_year_month_str = $last_year . '-' . $current_month; // YYYY-MM format for query

$sql_last_year = "
    SELECT fldItem, SUM(fldTotal) as total
    FROM tblUtilities
    WHERE DATE_FORMAT(STR_TO_DATE(fldDate, '%Y-%m-%d'), '%Y-%m') = :last_year_month
      AND fldItem IN ('Gas', 'Electric', 'Internet')
    GROUP BY fldItem
";
$stmt_last_year = $pdo->prepare($sql_last_year);
$stmt_last_year->execute([':last_year_month' => $last_year_month_str]);
$last_year_data = $stmt_last_year->fetchAll(PDO::FETCH_ASSOC);

foreach ($last_year_data as $row) {
    if (in_array($row['fldItem'], $bill_items)) {
        $last_year_totals[$row['fldItem']] = (float) $row['total'];
    }
}
$last_year_display_month = date('F Y', strtotime("$last_year-$current_month-01"));

// --- Simplified Next Month's Expected Bills ---

$upcoming_month_date = strtotime('+1 month');
$upcoming_m = date('m', $upcoming_month_date);
$forecast_display_month = date('F Y', $upcoming_month_date);

$forecast_totals = ['Gas' => 'N/A', 'Electric' => 'N/A', 'Internet' => 'N/A'];
$forecast_method = ['Gas' => '', 'Electric' => '', 'Internet' => ''];

$seasonal_average_years = 3; // Number of past years to average for seasonal forecast.
$fallback_average_months = 6; // Number of recent months to average if seasonal data is unavailable.

foreach ($bill_items as $item) {
    // 1. Try to get a seasonal average from the last X years.
    $sql_seasonal_avg = "
        SELECT AVG(fldTotal) as average_total
        FROM tblUtilities
        WHERE fldItem = :item
          AND MONTH(STR_TO_DATE(fldDate, '%Y-%m-%d')) = :month
          AND STR_TO_DATE(fldDate, '%Y-%m-%d') >= DATE_SUB(NOW(), INTERVAL :years YEAR)
    ";
    $stmt_seasonal_avg = $pdo->prepare($sql_seasonal_avg);
    $stmt_seasonal_avg->execute([
        ':item' => $item,
        ':month' => $upcoming_m,
        ':years' => $seasonal_average_years
    ]);
    $seasonal_result = $stmt_seasonal_avg->fetch(PDO::FETCH_ASSOC);

    if ($seasonal_result && $seasonal_result['average_total'] !== null) {
        $forecast_totals[$item] = (float) $seasonal_result['average_total'];
        $forecast_method[$item] = "Avg. of last $seasonal_average_years years for this month";
    } else {
        // 2. Fallback: If no seasonal data, get a simple average of the last X months.
        $sql_fallback_avg = "
            SELECT AVG(fldTotal) as average_total
            FROM tblUtilities
            WHERE fldItem = :item
              AND STR_TO_DATE(fldDate, '%Y-%m-%d') >= DATE_SUB(NOW(), INTERVAL :months MONTH)
        ";
        $stmt_fallback_avg = $pdo->prepare($sql_fallback_avg);
        $stmt_fallback_avg->execute([
            ':item' => $item,
            ':months' => $fallback_average_months
        ]);
        $fallback_result = $stmt_fallback_avg->fetch(PDO::FETCH_ASSOC);

        if ($fallback_result && $fallback_result['average_total'] !== null) {
            $forecast_totals[$item] = (float) $fallback_result['average_total'];
            $forecast_method[$item] = "Avg. of last $fallback_average_months months";
        }
        // If still no data, it remains 'N/A'.
    }
}

// --- Additional series and forecast for charts ---
// Build series for 'This Time Last Year' (per-month lookup)
$lastYearGas = [];
$lastYearElec = [];
foreach ($labels as $label) {
    [$y, $m] = explode('-', $label);
    $lyKey = ($y - 1) . '-' . $m;
    $lastYearGas[] = isset($monthly[$lyKey]) ? $monthly[$lyKey]['Gas'] : null;
    $lastYearElec[] = isset($monthly[$lyKey]) ? $monthly[$lyKey]['Electric'] : null;
}
// JS-safe arrays for the template
$js_original_labels = $labels;
$js_gas = array_map(fn($v) => is_numeric($v) ? (float)$v : null, $gasData);
$js_elec = array_map(fn($v) => is_numeric($v) ? (float)$v : null, $elecData);
$js_lastyear_gas = $lastYearGas;
$js_lastyear_elec = $lastYearElec;

?>
<main>
    <h2 class="section-title">Trends</h2>
    <div class="chart-wrapper">
        <canvas id="trendsChart"></canvas>
      <div style="display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap;">
        <p class="chart-note">Dashed lines show last year's series for comparison.</p>
        <a href="?export=csv" class="btn btn-primary">Export CSV</a>
      </div>
    </div>

    <div class="insights-section">
        <div class="insight-card">
            <h3>This Time Last Year (<?= htmlspecialchars($last_year_display_month) ?>)</h3>
            <?php if (empty($last_year_data)): ?>
                <p>No data available for this period last year.</p>
            <?php else: ?>
                <ul>
                    <?php foreach ($last_year_totals as $item => $total): ?>
                        <li><?= htmlspecialchars($item) ?>:
                            <?= is_numeric($total) ? '$' . number_format($total, 2) : htmlspecialchars($total) ?>
                        </li>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>
        </div>
        <div class="insight-card">
          <h3>Export Data</h3>
          <p>Download the monthly series (Gas & Electric) including last year's values as a CSV for analysis.</p>
          <a href="?export=csv" class="btn btn-primary">Download CSV</a>
        </div>
    </div>
</main>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
const rawLabels = <?php echo json_encode($js_original_labels); ?>;
const gasTotals = <?php echo json_encode($js_gas); ?>;
const elecTotals = <?php echo json_encode($js_elec); ?>;
const lastYearGas = <?php echo json_encode($js_lastyear_gas); ?>;
const lastYearElec = <?php echo json_encode($js_lastyear_elec); ?>;
const ctx = document.getElementById('trendsChart').getContext('2d');

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const formatLabel = label => {
  const [y,m] = label.split('-');
  return `${monthNames[parseInt(m,10)-1]} ${y}`;
};

const labels = rawLabels.map(formatLabel);
const allLabels = labels;

// Custom crosshair plugin
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw: (chart) => {
    if (chart.tooltip?._active?.length) {
      const activePoint = chart.tooltip._active[0];
      const ctx = chart.ctx;
      const x = activePoint.element.x;
      const topY = chart.scales.y.top;
      const bottomY = chart.scales.y.bottom;
      
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(230, 238, 248, 0.3)';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    }
  }
};

const datasets = [
  {
    label: 'Gas',
    data: gasTotals,
    borderColor: '#7C4DFF',
    backgroundColor: 'rgba(124,77,255,0.12)',
    tension: 0.3,
    pointRadius: 4,
    pointHoverRadius: 6,
    borderWidth: 2.5,
    fill: true
  },
  {
    label: 'Gas — Last Year',
    data: lastYearGas,
    borderColor: 'rgba(124,77,255,0.55)',
    borderDash: [8,4],
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 2,
    fill: false
  },
  {
    label: 'Electric',
    data: elecTotals,
    borderColor: '#5B8DEF',
    backgroundColor: 'rgba(91,141,239,0.10)',
    tension: 0.3,
    pointRadius: 4,
    pointHoverRadius: 6,
    borderWidth: 2.5,
    fill: true
  },
  {
    label: 'Electric — Last Year',
    data: lastYearElec,
    borderColor: 'rgba(91,141,239,0.55)',
    borderDash: [8,4],
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 2,
    fill: false
  },
];

function currencyTick(value) {
  if (value === undefined || value === null) return '';
  return '$' + Number(value).toLocaleString(undefined, {maximumFractionDigits:0});
}

// Detect mobile for responsive chart options
const isMobile = window.innerWidth < 768;

new Chart(ctx, {
  type: 'line',
  data: { labels: allLabels, datasets },
  plugins: [crosshairPlugin],
  options: {
    responsive: true,
    maintainAspectRatio: !isMobile,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { 
        position: isMobile ? 'bottom' : 'top',
        labels: {
          color: 'rgba(230, 238, 248, 0.9)',
          usePointStyle: true,
          padding: isMobile ? 10 : 16,
          boxWidth: isMobile ? 8 : 40,
          font: { size: isMobile ? 11 : 12 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(11, 18, 32, 0.95)',
        titleColor: '#E6EEF8',
        bodyColor: '#E6EEF8',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: isMobile ? 8 : 12,
        displayColors: true,
        titleFont: { size: isMobile ? 12 : 14 },
        bodyFont: { size: isMobile ? 11 : 13 },
        callbacks: {
          label: ctx => {
            const v = ctx.parsed.y;
            return ctx.dataset.label + ': ' + (v === null ? 'N/A' : '$' + Number(v).toFixed(2));
          }
        }
      }
    },
    scales: {
      x: { 
        title: { display: !isMobile, text: 'Month', color: 'rgba(230, 238, 248, 0.7)' },
        ticks: { 
          color: 'rgba(230, 238, 248, 0.7)',
          maxRotation: isMobile ? 45 : 0,
          font: { size: isMobile ? 10 : 12 }
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      },
      y: {
        title: { display: !isMobile, text: 'Total ($)', color: 'rgba(230, 238, 248, 0.7)' },
        ticks: { 
          callback: currencyTick, 
          color: 'rgba(230, 238, 248, 0.7)',
          font: { size: isMobile ? 10 : 12 }
        },
        grid: { color: 'rgba(255,255,255,0.05)' }
      }
    }
  }
});
</script>
<?php require_once dirname(__DIR__) . '/includes/footer.php'; ?>