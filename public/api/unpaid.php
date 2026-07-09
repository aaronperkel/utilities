<?php
// public/api/unpaid.php  — JSON API for unpaid utilities (PDO + optional SSL + HMAC auth)

ini_set('log_errors', 1);
// optional: ?debug=1 to display errors while testing (remove/disable in prod)
if (isset($_GET['debug'])) { ini_set('display_errors', 1); error_reporting(E_ALL); }

header('Content-Type: application/json');

// -----------------------------------------------------------------------------
// Config loading (from environment first, then fallback to a private file)
// -----------------------------------------------------------------------------
$conf = [];
$iniPath = '/users/a/p/aperkel/private/api.env'; // keep this OUT of webroot
if (is_readable($iniPath)) {
    $lines = file($iniPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $ln) {
        if (strpos($ln, '=') !== false) {
            [$k,$v] = array_map('trim', explode('=', $ln, 2));
            $conf[$k] = $v;
        }
    }
}
function cfg($key, $default = null) {
    global $conf;
    $v = getenv($key);
    if ($v === false || $v === '') $v = $conf[$key] ?? $default;
    return $v;
}

// -----------------------------------------------------------------------------
// Auth (API key + optional HMAC with timestamp)
// -----------------------------------------------------------------------------
$API_KEY  = cfg('API_KEY', '');
$HMAC_KEY = cfg('HMAC_KEY', null);
if (!$API_KEY) {
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>'server config missing']);
    exit;
}

$got_key = $_SERVER['HTTP_X_API_KEY'] ?? '';
if (!hash_equals($API_KEY, $got_key)) {
    http_response_code(401);
    echo json_encode(['ok'=>false,'error'=>'unauthorized']);
    exit;
}

if ($HMAC_KEY) {
    $ts  = $_SERVER['HTTP_X_TIMESTAMP'] ?? '';
    $sig = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
    if (!$ts || !$sig) {
        http_response_code(401);
        echo json_encode(['ok'=>false,'error'=>'missing hmac headers']);
        exit;
    }
    if (abs(time() - intval($ts)) > 300) {
        http_response_code(401);
        echo json_encode(['ok'=>false,'error'=>'timestamp skew']);
        exit;
    }
    $method = $_SERVER['REQUEST_METHOD'];
    $path   = $_SERVER['REQUEST_URI']; // must match client signing
    $body   = file_get_contents('php://input') ?: '';
    $base   = $method."\n".$path."\n".$ts."\n".$body;
    $want   = base64_encode(hash_hmac('sha256', $base, $HMAC_KEY, true));
    if (!hash_equals($want, $sig)) {
        http_response_code(401);
        echo json_encode(['ok'=>false,'error'=>'bad signature']);
        exit;
    }
}

// -----------------------------------------------------------------------------
// DB connection (PDO) with optional SSL
// -----------------------------------------------------------------------------
$host = cfg('DB_HOST', 'localhost');
$user = cfg('DB_USER', '');
$pass = cfg('DB_PASS', '');
$name = cfg('DB_NAME', '');

// >>> This is the block you wanted, in context:
$useSsl = filter_var(cfg('DB_USE_SSL','false'), FILTER_VALIDATE_BOOLEAN);
$caPath = cfg('DB_SSL_CA_PATH', '');

$pdoOpts = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
];

if ($useSsl && $caPath && is_readable($caPath)) {
    $pdoOpts[PDO::MYSQL_ATTR_SSL_CA] = $caPath;
    // Optional hardening:
    // $pdoOpts[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
}

try {
    $dsn = "mysql:host=$host;dbname=$name;charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, $pdoOpts);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>'db connect','detail'=>$e->getMessage()]);
    exit;
}

// -----------------------------------------------------------------------------
// Queries (normalized schema): totals + per-person + detail
// -----------------------------------------------------------------------------
try {
    // Overall outstanding = sum of remaining per-person shares for unpaid bills
    $row = $pdo->query("
        SELECT COALESCE(SUM(u.fldCost),0) AS totalOutstanding
        FROM tblUtilities u
        JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
        WHERE u.fldStatus = 'Unpaid';
    ")->fetch();
    $totalOutstanding = (float)($row['totalOutstanding'] ?? 0);

    // Per-person totals
    $people = [];
    $stmt = $pdo->query("
        SELECT p.personName, COALESCE(SUM(u.fldCost),0) AS totalOwedByPerson
        FROM tblUtilities u
        JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
        JOIN tblPeople p ON bo.personID = p.personID
        WHERE u.fldStatus = 'Unpaid'
        GROUP BY p.personName
        ORDER BY p.personName;
    ");
    foreach ($stmt as $r) {
        $people[] = [
            'personName' => $r['personName'],
            'totalOwedByPerson' => (float)$r['totalOwedByPerson'],
        ];
    }

    // Detailed rows (optional; handy for debugging)
    $detail = [];
    $stmt = $pdo->query("
        SELECT u.pmkBillID AS billID, u.fldItem AS item, u.fldTotal AS billTotal,
               u.fldCost AS perPersonCost, u.fldDue AS dueDate, p.personName AS personOwing
        FROM tblUtilities u
        JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
        JOIN tblPeople p ON bo.personID = p.personID
        WHERE u.fldStatus = 'Unpaid'
        ORDER BY u.fldDue, u.pmkBillID, p.personName;
    ");
    foreach ($stmt as $r) {
        $detail[] = [
            'billID' => (int)$r['billID'],
            'item' => $r['item'],
            'billTotal' => (float)$r['billTotal'],
            'perPersonCost' => (float)$r['perPersonCost'],
            'dueDate' => $r['dueDate'],
            'personOwing' => $r['personOwing'],
        ];
    }

    echo json_encode([
        'ok' => true,
        'totalOutstanding' => $totalOutstanding,
        'perPerson' => $people,
        'detail' => $detail
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok'=>false,'error'=>'query failed','detail'=>$e->getMessage()]);
}
