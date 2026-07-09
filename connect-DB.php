<?php
// connect-DB.php
// Establishes a database connection using PDO and loads environment variables.

require __DIR__ . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../', 'utilities.env');
$dotenv->load();

$databaseName = $_ENV['DB_NAME'] ?? null;
$username     = $_ENV['DB_USER'] ?? null;
$password     = $_ENV['DB_PASS'] ?? null;
$dbHost       = $_ENV['DB_HOST'] ?? 'webdb.uvm.edu';

$dbUseSsl    = strtolower($_ENV['DB_USE_SSL'] ?? 'false') === 'true';
$dbSslCaPath = $_ENV['DB_SSL_CA_PATH'] ?? null;

if (!$databaseName || !$username || !$password) {
    die("Error: DB_NAME, DB_USER, and DB_PASS must be set in utilities.env.");
}

$dsn     = "mysql:host={$dbHost};dbname={$databaseName}";
$options = [];

if ($dbUseSsl) {
    $caPath = $dbSslCaPath;
    if ($caPath && !preg_match('/^([\/]|[a-zA-Z]:)/', $caPath)) {
        $caPath = __DIR__ . '/../' . $caPath;
    }
    if ($caPath && is_readable($caPath)) {
        $options[PDO::MYSQL_ATTR_SSL_CA] = $caPath;
    } else {
        error_log("DB_USE_SSL is true but DB_SSL_CA_PATH is missing or unreadable. Connecting without CA verification.");
    }
} else {
    $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
}

try {
    $pdo = new PDO($dsn, $username, $password, $options);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    error_log("Database connection failed: " . $e->getMessage());
    die("Database connection failed. Check server logs.");
}

// =============================================================================
// User / auth helpers — all driven by tblPeople (uid, email, is_admin columns)
// =============================================================================

/**
 * Halt with 403 if the current user is not in tblPeople.
 * Called from top.php on every page load.
 */
function requireUser(): void
{
    global $pdo;
    $uid = $_SERVER['REMOTE_USER'] ?? '';
    $stmt = $pdo->prepare("SELECT personID FROM tblPeople WHERE uid = :uid");
    $stmt->execute([':uid' => $uid]);
    if (!$stmt->fetch()) {
        ob_end_clean();
        http_response_code(403);
        exit('403 Forbidden: You are not authorised to access this application.');
    }
}

/**
 * Halt with 403 if the current user is not an admin.
 * Call at the top of any admin-only page after top.php is included.
 */
function requireAdmin(): void
{
    global $pdo;
    $uid = $_SERVER['REMOTE_USER'] ?? '';
    $stmt = $pdo->prepare("SELECT is_admin FROM tblPeople WHERE uid = :uid");
    $stmt->execute([':uid' => $uid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !$row['is_admin']) {
        http_response_code(403);
        exit('403 Forbidden: Admin access required.');
    }
}

/**
 * Returns true if the current user has admin privileges (non-fatal check for nav/UI).
 */
function isAdmin(): bool
{
    global $pdo;
    $uid = $_SERVER['REMOTE_USER'] ?? '';
    if (!$uid) return false;
    $stmt = $pdo->prepare("SELECT is_admin FROM tblPeople WHERE uid = :uid");
    $stmt->execute([':uid' => $uid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return !empty($row['is_admin']);
}

/**
 * Resolve the current user's display name from their NetID.
 */
function getCurrentUserName(): string
{
    global $pdo;
    $uid = $_SERVER['REMOTE_USER'] ?? '';
    $stmt = $pdo->prepare("SELECT personName FROM tblPeople WHERE uid = :uid");
    $stmt->execute([':uid' => $uid]);
    return $stmt->fetchColumn() ?: $uid;
}

/**
 * Returns a name→email map for all users with a configured email address.
 */
function getEmailMap(): array
{
    global $pdo;
    $rows = $pdo->query("SELECT personName, email FROM tblPeople WHERE email IS NOT NULL AND email != ''")->fetchAll(PDO::FETCH_ASSOC);
    return array_column($rows, 'email', 'personName');
}


