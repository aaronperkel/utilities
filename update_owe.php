<?php
// update_owe.php
// Handles updates to who owes for a specific bill based on checkbox submissions from portal.php.
// Works with the normalized schema: tblPeople, tblBillOwes, tblUtilities.

session_start(); // Start session for CSRF token access and potential flash messages.
include './connect-DB.php';
requireAdmin();

$allPeople = [];

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


    $peopleActuallyOwingCount = 0;

    try {
        $pdo->beginTransaction();

        $stmtClearOwes = $pdo->prepare("DELETE FROM tblBillOwes WHERE billID = :billID");
        $stmtClearOwes->execute([':billID' => $billID]);

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
            include 'update_ics.php';
        }
        $_SESSION['success_message'] = "Payment statuses for bill ID {$billID} updated. Overall status: {$newOverallStatus}.";

    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log("Error updating payment status for bill ID {$billID}: " . $e->getMessage());
        $_SESSION['error_message'] = "Database error updating payment status. Details: " . htmlspecialchars($e->getMessage());
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