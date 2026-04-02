<?php
// update_owe.php
// Handles updates to who owes for a specific bill based on checkbox submissions from portal.php.
// Works with the normalized schema: tblPeople, tblBillOwes, tblUtilities.

session_start(); // Start session for CSRF token access and potential flash messages.
require_once dirname(__DIR__) . '/includes/connect-DB.php';

$is_dry_run_active = isDryRunActive(); // Check dry-run status. This re-uses the function from connect-DB.
$allPeople = []; // Initialize $allPeople

// Fetch all people for determining who could owe.
try {
    $peopleStmt = $pdo->query("SELECT personID, personName FROM tblPeople ORDER BY personName ASC");
    $allPeople = $peopleStmt->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    error_log("Error fetching people in update_owe.php: " . $e->getMessage());
    $_SESSION['error_message'] = "Could not load user data. Payment status update failed.";
    header('Location: ' . ($_SERVER['HTTP_REFERER'] ?? 'portal.php'));
    exit;
}

if (empty($allPeople)) {
    $_SESSION['error_message'] = "No users found in the system (tblPeople is empty). Cannot update payment status.";
    header('Location: ' . ($_SERVER['HTTP_REFERER'] ?? 'portal.php'));
    exit;
}


if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // 1. Verify CSRF token
    if (!isset($_POST['csrf_token']) || !isset($_SESSION['csrf_token_list_forms']) || !hash_equals($_SESSION['csrf_token_list_forms'], $_POST['csrf_token'])) {
        $_SESSION['error_message'] = "CSRF token validation failed. Please try again.";
        header('Location: portal.php');
        exit;
    }

    // 2. Get Inputs
    $billID = filter_input(INPUT_POST, 'billID', FILTER_VALIDATE_INT);
    $paidPersonIDs = $_POST['paidPersonIDs'] ?? [];
    if (!is_array($paidPersonIDs))
        $paidPersonIDs = [];
    $paidPersonIDs = array_map('intval', $paidPersonIDs);


    if (!$billID) {
        $_SESSION['error_message'] = "No bill ID provided for updating payment status.";
        header('Location: portal.php');
        exit;
    }

    $dryRunMessages = [];

    // Fetch current global status of the bill to compare later for ics update
    $currentBillGlobalStatus = 'Unpaid'; // Default
    try {
        $utilStatusStmt = $pdo->prepare("SELECT fldStatus FROM tblUtilities WHERE pmkBillID = :billID");
        $utilStatusStmt->execute([':billID' => $billID]);
        $statusResult = $utilStatusStmt->fetchColumn();
        if ($statusResult !== false) {
            $currentBillGlobalStatus = $statusResult;
        } else {
            // Bill ID not found, critical error
            throw new Exception("Bill ID {$billID} not found in tblUtilities.");
        }
    } catch (Exception $e) {
        error_log("Error fetching bill status in update_owe.php for bill ID {$billID}: " . $e->getMessage());
        $_SESSION['error_message'] = "Error fetching bill details: " . htmlspecialchars($e->getMessage());
        header('Location: ' . ($_SERVER['HTTP_REFERER'] ?? 'portal.php'));
        exit;
    }


    // 4. Logic to update tblBillOwes and tblUtilities.fldStatus
    $peopleActuallyOwingCount = 0; // For live mode, based on actual remaining entries
    $simulatedPeopleOwingCount = 0; // For dry run mode

    if ($is_dry_run_active) {
        $dryRunMessages[] = "DRY RUN MODE: Simulating payment updates for bill ID: {$billID}. Current global status: {$currentBillGlobalStatus}.";
        // Simulate changes to owing list
        $currentOwingStmt = $pdo->prepare("SELECT personID FROM tblBillOwes WHERE billID = :billID");
        $currentOwingStmt->execute([':billID' => $billID]);
        $simulatedOwingPersonIDs = $currentOwingStmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($allPeople as $person) {
            $personID = $person['personID'];
            $personName = htmlspecialchars($person['personName']);
            $isCurrentlyOwing = in_array($personID, $simulatedOwingPersonIDs);

            if (in_array($personID, $paidPersonIDs, true)) { // Person is marked as PAID by form
                if ($isCurrentlyOwing) {
                    $dryRunMessages[] = "DRY RUN: Would REMOVE {$personName} (ID: {$personID}) from owing this bill.";
                } else {
                    // $dryRunMessages[] = "DRY RUN: {$personName} (ID: {$personID}) is already not owing (no change needed for this person).";
                }
            } else { // Person is marked as OWING by form
                if (!$isCurrentlyOwing) {
                    // Only add if bill is not globally 'Paid' OR if this action makes it 'Unpaid'
                    $dryRunMessages[] = "DRY RUN: Would ADD {$personName} (ID: {$personID}) to owing this bill.";
                } else {
                    // $dryRunMessages[] = "DRY RUN: {$personName} (ID: {$personID}) is already owing (no change needed for this person).";
                }
                $simulatedPeopleOwingCount++; // This person contributes to owing count
            }
        }
        $finalSimulatedOwingCount = $simulatedPeopleOwingCount; // Based on form submission logic
        $newOverallStatus = ($finalSimulatedOwingCount === 0) ? 'Paid' : 'Unpaid';
        $dryRunMessages[] = "DRY RUN: Based on selections, {$finalSimulatedOwingCount} people would owe. Overall status for bill ID {$billID} would be updated to '{$newOverallStatus}'.";
        if ($currentBillGlobalStatus !== $newOverallStatus) {
            $dryRunMessages[] = "DRY RUN: Calendar file (update_ics.php) would have been updated due to status change.";
        }
    } else { // Live Mode
        try {
            $pdo->beginTransaction();

            // Clear existing entries for this bill in tblBillOwes
            $stmtClearOwes = $pdo->prepare("DELETE FROM tblBillOwes WHERE billID = :billID");
            $stmtClearOwes->execute([':billID' => $billID]);

            // Add back only those who are still marked as owing (i.e., NOT in $paidPersonIDs)
            $stmtInsertOwe = $pdo->prepare("INSERT INTO tblBillOwes (billID, personID) VALUES (:billID, :personID)");
            foreach ($allPeople as $person) {
                if (!in_array($person['personID'], $paidPersonIDs, true)) {
                    $stmtInsertOwe->execute([':billID' => $billID, ':personID' => $person['personID']]);
                    $peopleActuallyOwingCount++;
                }
            }

            $newOverallStatus = ($peopleActuallyOwingCount === 0) ? 'Paid' : 'Unpaid';
            $statusActuallyChanged = false;
            if ($currentBillGlobalStatus !== $newOverallStatus) {
                $stmtUpdateStatus = $pdo->prepare("UPDATE tblUtilities SET fldStatus = :status WHERE pmkBillID = :id");
                $stmtUpdateStatus->execute([':status' => $newOverallStatus, ':id' => $billID]);
                $statusActuallyChanged = true;
            }

            $pdo->commit();

            if ($statusActuallyChanged) {
                require_once dirname(__DIR__) . '/includes/update_ics.php';
            }
            $_SESSION['success_message'] = "Payment statuses for bill ID {$billID} updated. Overall status: {$newOverallStatus}.";

        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Error updating payment status for bill ID {$billID}: " . $e->getMessage());
            $_SESSION['error_message'] = "Database error updating payment status. Details: " . htmlspecialchars($e->getMessage());
        }
    }

    if ($is_dry_run_active && !empty($dryRunMessages)) {
        $_SESSION['dry_run_action_message'] = implode("<br>", $dryRunMessages);
    }

    // 5. Redirect back
    header('Location: ' . ($_SERVER['HTTP_REFERER'] ?? 'portal.php'));
    exit;

} else {
    $_SESSION['error_message'] = "Invalid request method for updating payment status.";
    header('Location: portal.php');
    exit;
}
?>