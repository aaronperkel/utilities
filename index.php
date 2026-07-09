<?php
// index.php
// Public-facing page to display utility bills and the amount owed by the current user.
// Features pagination for browsing bills.

include 'top.php'; // Includes header, navigation, and database connection (connect-DB.php).
// .env variables are also loaded via connect-DB.php.

// --- Function Definitions ---
// Shared helpers (billEmoji, getTotalBillCount, getBillsForPage, paginationHtml)
// are loaded from includes/helpers.php via top.php.

/**
 * Calculates the total outstanding amount owed by a specific user for unpaid bills.
 */
function getUserOwedAmount(PDO $pdo, string $userName): float
{
    $sql = "
        SELECT SUM(u.fldCost) AS owed
        FROM tblUtilities u
        JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
        JOIN tblPeople p ON bo.personID = p.personID
        WHERE p.personName = :userName
          AND u.fldStatus <> 'Paid'
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':userName' => $userName]);
    return (float) ($stmt->fetch(PDO::FETCH_ASSOC)['owed'] ?? 0);
}

/**
 * Groups bill records by year (descending).
 */
function groupBillsByYear(array $bills): array
{
    $billsByYear = [];
    foreach ($bills as $bill) {
        try {
            // Create a DateTime object from the bill's date string.
            $dt = new DateTime($bill['fldDate']);
            $year = $dt->format('Y'); // Extract the year.
            $billsByYear[$year][] = $bill; // Add bill to the corresponding year's group.
        } catch (Exception $e) {
            // Log error if date format is invalid and prevents DateTime creation.
            error_log("Invalid date format for bill (ID: " . ($bill['pmkBillID'] ?? 'N/A') . "): " . $bill['fldDate'] . " - " . $e->getMessage());
        }
    }
    krsort($billsByYear); // Sort the groups by year in reverse (descending) order.
    return $billsByYear;
}

// --- Main Logic ---

// Resolve the current user's display name (DB or .env depending on APP_USE_DB_USERS).
$userName = getCurrentUserName();

// Calculate the total amount this user owes for unpaid bills.
$userOwedAmount = getUserOwedAmount($pdo, $userName);

// Fetch IDs of bills the current user owes for (and are not globally 'Paid')
// This is done once to avoid N+1 queries in the loop.
$userOwedBillIDs = [];
if (!empty($userName)) {
    $userOwesStmt = $pdo->prepare("
        SELECT bo.billID
        FROM tblBillOwes bo
        JOIN tblPeople p ON bo.personID = p.personID
        JOIN tblUtilities u ON bo.billID = u.pmkBillID
        WHERE p.personName = :userName AND u.fldStatus <> 'Paid'
    ");
    $userOwesStmt->execute([':userName' => $userName]);
    $userOwedBillIDs = $userOwesStmt->fetchAll(PDO::FETCH_COLUMN);
}

// --- Pagination Setup ---
$billsPerPage = (int) ($_ENV['APP_BILLS_PER_PAGE'] ?? 10);
$currentPage = isset($_GET['page']) ? (int) $_GET['page'] : 1; // Get current page from URL query param.
if ($currentPage < 1) { // Ensure current page is not less than 1.
    $currentPage = 1;
}
$offset = ($currentPage - 1) * $billsPerPage; // Calculate the offset for SQL query.

$totalBills = getTotalBillCount($pdo); // Get total number of all bills.
$totalPages = $totalBills > 0 ? ceil($totalBills / $billsPerPage) : 1; // Calculate total pages, ensuring at least 1.

// If user tries to access a page beyond the total, redirect to the last valid page.
// This prevents errors or empty pages if an invalid page number is manually entered in URL.
if ($currentPage > $totalPages && $totalBills > 0) {
    header('Location: ?page=' . $totalPages);
    exit; // Stop script execution after redirect.
}

// Fetch the bills for the current page using the calculated limit and offset.
$billsForCurrentPage = getBillsForPage($pdo, $billsPerPage, $offset);
// Group these paged bills by year for display.
$billsByYear = groupBillsByYear($billsForCurrentPage);

?>
<main>
    <div class="hero card">
        <div class="hero-left">
            <h2>Welcome, <?= htmlspecialchars($userName ?: 'Guest') ?></h2>
            <p class="hero-sub">Your current outstanding balance</p>
        </div>
        <div class="hero-right">
            <div class="hero-amount">$<?= number_format($userOwedAmount, 2) ?></div>
            <div class="hero-actions">
                <a href="trends.php" class="btn btn-primary btn-sm">View Trends</a>
            </div>
        </div>
    </div>

    <h2 class="section-title">Utility Bills</h2>

    <div id="bills-container">
    <?php if (empty($billsForCurrentPage)): ?>
        <p>No bills found for this page or no bills available.</p>
    <?php else: ?>
        <?php foreach ($billsByYear as $year => $yearCells): ?>
            <h3 class="section-subtitle"><?= htmlspecialchars($year) ?></h3>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Bill</th>
                            <th>Amount</th>
                            <th>Due</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($yearCells as $cell):
                            // Determine if the current user owes for this specific bill
                            $isOwedByCurrentUser = false;
                            if ($cell['fldStatus'] !== 'Paid') {
                                $isOwedByCurrentUser = in_array($cell['pmkBillID'], $userOwedBillIDs);
                            }
                            ?>
                            <tr class="bill-row" data-bill-id="<?= htmlspecialchars($cell['pmkBillID']) ?>" data-due="<?= htmlspecialchars($cell['fldDue']) ?>" data-status="<?= $isOwedByCurrentUser ? 'unpaid' : 'paid' ?>">
                                <?php
                                      $billedDate = (new DateTime($cell['fldDate']))->format('M j, Y');
                                      $isPaid = !$isOwedByCurrentUser;
                                ?>

                                <td class="item-cell">
                                    <div class="item-name"><?= billEmoji($cell['fldItem']) ?> <?= htmlspecialchars($cell['fldItem']) ?></div>
                                    <div class="item-date"><?= htmlspecialchars($billedDate) ?></div>
                                </td>

                                <td class="price-cell">
                                    <div class="price-main">$<?= htmlspecialchars(number_format((float) $cell['fldTotal'], 2)) ?></div>
                                    <div class="price-sub">$<?= htmlspecialchars(number_format((float) $cell['fldCost'], 2)) ?> / person</div>
                                </td>

                                <td class="due-cell">
                                    <span class="due-chip" data-due="<?= htmlspecialchars($cell['fldDue']) ?>" data-paid="<?= $isPaid ? '1' : '0' ?>"></span>
                                </td>

                                <td class="status-cell">
                                    <?php if ($isOwedByCurrentUser): ?>
                                        <span class="badge badge-unpaid" aria-label="Unpaid by you">Unpaid</span>
                                    <?php else: ?>
                                        <span class="badge badge-paid" aria-label="Paid by you">Paid</span>
                                    <?php endif; ?>
                                </td>

                                <td class="actions-cell">
                                    <div class="action-btns">
                                        <a href="<?= htmlspecialchars($cell['fldView']) ?>" target="_blank" class="btn-icon btn-sm" title="View bill" aria-label="View bill <?= htmlspecialchars($cell['pmkBillID']) ?>"><i class="fa fa-eye" aria-hidden="true"></i></a>
                                        <a href="<?= htmlspecialchars($cell['fldView']) ?>" download class="btn-icon btn-sm" title="Download bill" aria-label="Download bill <?= htmlspecialchars($cell['pmkBillID']) ?>"><i class="fa fa-download" aria-hidden="true"></i></a>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
    </div><!-- #bills-container -->

    <?= paginationHtml($currentPage, $totalPages) ?>

    <div class="secondary-actions">
        <a href="trends.php?export=csv" class="btn btn-outline btn-sm">Export CSV</a>
        <a href="webcal://utilities.aperkel.w3.uvm.edu/cal.ics" class="btn btn-outline btn-sm">Add to iCal</a>
    </div>
</main>

<?php include 'footer.php'; ?>