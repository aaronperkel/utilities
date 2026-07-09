<?php
// CSV export must happen BEFORE any HTML output
// Include DB connection only (not top.php which outputs HTML)
if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    // Start output buffering to catch any stray output from connect-DB.php
    ob_start();
    
    // Suppress display errors for CSV output
    ini_set('display_errors', 0);
    error_reporting(0);
    
    include 'connect-DB.php';
    
    // Fetch data for CSV
    $sql = "
      SELECT
        DATE_FORMAT(fldDate, '%Y-%m') AS month,
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

include 'top.php';

// fetch monthly sums for Gas & Electric
$sql = "
  SELECT
    DATE_FORMAT(fldDate, '%Y-%m') AS month,
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
    WHERE DATE_FORMAT(fldDate, '%Y-%m') = :last_year_month
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
          AND MONTH(fldDate) = :month
          AND fldDate >= DATE_SUB(NOW(), INTERVAL :years YEAR)
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
              AND fldDate >= DATE_SUB(NOW(), INTERVAL :months MONTH)
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

// --- YTD totals for current year ---
$ytdData = $pdo->query("
    SELECT fldItem, SUM(fldTotal) AS total, SUM(fldCost) AS per_person
    FROM tblUtilities
    WHERE YEAR(fldDate) = YEAR(CURDATE())
    GROUP BY fldItem
")->fetchAll(PDO::FETCH_ASSOC);
$ytdByItem = array_column($ytdData, null, 'fldItem');

// --- All-time totals since move-in ---
$allTimeData = $pdo->query("
    SELECT fldItem, SUM(fldTotal) AS total, SUM(fldCost) AS per_person, MIN(fldDate) AS first_bill
    FROM tblUtilities
    GROUP BY fldItem
")->fetchAll(PDO::FETCH_ASSOC);
$allTimeByItem = array_column($allTimeData, null, 'fldItem');
$allTimeGrand  = array_sum(array_column($allTimeData, 'total'));
$allTimePerPerson = array_sum(array_column($allTimeData, 'per_person'));
$moveInDate = null;
foreach ($allTimeData as $r) {
    if ($r['first_bill'] && (!$moveInDate || $r['first_bill'] < $moveInDate)) {
        $moveInDate = $r['first_bill'];
    }
}
$moveInYear = $moveInDate ? date('Y', strtotime($moveInDate)) : null;

// Build last year overlay series
$gasLY   = [];
$elecLY  = [];
foreach ($labels as $label) {
    [$y, $m] = explode('-', $label);
    $lyKey = ($y - 1) . '-' . $m;
    $gasLY[]  = isset($monthly[$lyKey]) ? round((float)$monthly[$lyKey]['Gas'], 2)      : null;
    $elecLY[] = isset($monthly[$lyKey]) ? round((float)$monthly[$lyKey]['Electric'], 2) : null;
}

// JS-safe arrays for line chart
$js_labels  = $labels;
$js_gas     = array_map(fn($v) => is_numeric($v) ? round((float)$v, 2) : null, $gasData);
$js_elec    = array_map(fn($v) => is_numeric($v) ? round((float)$v, 2) : null, $elecData);
$js_gas_ly  = $gasLY;
$js_elec_ly = $elecLY;

// billEmoji() is provided by includes/helpers.php
?>
<main>
    <div class="section-header">
        <h2 class="section-title">Trends</h2>
        <a href="?export=csv" class="btn btn-outline btn-sm">Export CSV</a>
    </div>

    <div class="chart-wrapper">
        <div class="chart-canvas-box"><canvas id="trendsChart"></canvas></div>
        <p class="chart-note">Monthly Gas &amp; Electric costs — last 12 months.</p>
    </div>

    <div class="insights-section">
        <div class="insight-card">
            <h3><?= date('Y') ?> Year to Date</h3>
            <ul>
                <?php foreach (['Gas', 'Electric', 'Internet'] as $it): $d = $ytdByItem[$it] ?? null; ?>
                    <li>
                        <span><?= billEmoji($it) ?> <?= $it ?></span>
                        <strong><?= $d ? '$' . number_format((float)$d['total'], 2) : '—' ?></strong>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>

        <div class="insight-card">
            <h3>Since Move-In<?= $moveInYear ? ' (' . $moveInYear . ')' : '' ?></h3>
            <ul>
                <?php foreach (['Gas', 'Electric', 'Internet'] as $it): $d = $allTimeByItem[$it] ?? null; ?>
                    <li>
                        <span><?= billEmoji($it) ?> <?= $it ?></span>
                        <strong><?= $d ? '$' . number_format((float)$d['total'], 2) : '—' ?></strong>
                    </li>
                <?php endforeach; ?>
                <li class="insight-total">
                    <span>Total</span>
                    <strong>$<?= number_format($allTimeGrand, 2) ?></strong>
                </li>
            </ul>
        </div>

        <div class="insight-card">
            <h3>This Time Last Year</h3>
            <ul>
                <?php foreach ($last_year_totals as $it => $total): ?>
                    <li>
                        <span><?= billEmoji($it) ?> <?= $it ?></span>
                        <strong><?= is_numeric($total) ? '$' . number_format((float)$total, 2) : '—' ?></strong>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>
    </div>
</main>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
const rawLabels  = <?= json_encode($js_labels) ?>;
const gasTotals  = <?= json_encode($js_gas) ?>;
const elecTotals = <?= json_encode($js_elec) ?>;
const gasLY      = <?= json_encode($js_gas_ly) ?>;
const elecLY     = <?= json_encode($js_elec_ly) ?>;

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const labels = rawLabels.map(l => { const [y,m] = l.split('-'); return monthNames[+m-1] + ' \'' + y.slice(2); });

const isMobile = window.innerWidth < 640;

const tooltipDefaults = {
    backgroundColor: 'rgba(11,18,32,0.95)',
    titleColor: '#E6EEF8',
    bodyColor: '#E6EEF8',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    padding: 12,
    cornerRadius: 8,
    displayColors: true,
};

new Chart(document.getElementById('trendsChart').getContext('2d'), {
    type: 'line',
    data: {
        labels,
        datasets: [
            {
                label: '🔥 Gas',
                data: gasTotals,
                borderColor: '#E2E8F0',
                backgroundColor: 'rgba(226,232,240,0.12)',
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 5,
                fill: false,
                tension: 0.3,
            },
            {
                label: '⚡ Electric',
                data: elecTotals,
                borderColor: '#60A5FA',
                backgroundColor: 'rgba(96,165,250,0.12)',
                borderWidth: 2.5,
                pointRadius: 3,
                pointHoverRadius: 5,
                fill: false,
                tension: 0.3,
            },
            {
                label: '🔥 Gas (last year)',
                data: gasLY,
                borderColor: 'rgba(226,232,240,0.35)',
                borderWidth: 1.5,
                borderDash: [5, 4],
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false,
                tension: 0.3,
            },
            {
                label: '⚡ Electric (last year)',
                data: elecLY,
                borderColor: 'rgba(96,165,250,0.35)',
                borderWidth: 1.5,
                borderDash: [5, 4],
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false,
                tension: 0.3,
            },
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: 'rgba(230,238,248,0.9)',
                    usePointStyle: true,
                    pointStyle: 'line',
                    padding: 20,
                    font: { size: 13 }
                }
            },
            tooltip: {
                ...tooltipDefaults,
                callbacks: {
                    label: ctx => ctx.parsed.y !== null
                        ? ' ' + ctx.dataset.label + ':  $' + Number(ctx.parsed.y).toFixed(2)
                        : null
                }
            }
        },
        scales: {
            x: {
                ticks: { color: 'rgba(230,238,248,0.6)', maxRotation: isMobile ? 45 : 0, font: { size: isMobile ? 10 : 12 } },
                grid: { color: 'rgba(255,255,255,0.04)' }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    color: 'rgba(230,238,248,0.6)',
                    font: { size: 12 },
                    callback: v => '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
                },
                grid: { color: 'rgba(255,255,255,0.06)' }
            }
        }
    }
});
</script>
<?php include 'footer.php'; ?>