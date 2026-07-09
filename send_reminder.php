<?php
// send_reminder.php - send email reminders via PHP mail()
session_start(); // Start session for CSRF token access

include './connect-DB.php';
requireAdmin();

if (isset($_POST['sendReminder'])) {
    // Verify CSRF token
    if (!isset($_POST['csrf_token']) || !isset($_SESSION['csrf_token_list_forms']) || !hash_equals($_SESSION['csrf_token_list_forms'], $_POST['csrf_token'])) {
        die("CSRF token validation failed for send reminder.");
    }
    // It's good practice to use the token once, but for list forms that might refresh
    // or allow multiple actions, regeneration might be too aggressive or needs careful handling.
    // For now, we won't regenerate it here to allow multiple reminders from the same page load.
    // (Token is general for list actions, portal.php will regen if it becomes empty).

    $billId = htmlspecialchars($_POST['pmk']);

    // Load configurations from .env variables.
    $appBaseUrl = rtrim($_ENV['APP_BASE_URL'] ?? 'https://utilities.example.com', '/');
    $emailMapArray = getEmailMap();
    $appEmailFromAddress = $_ENV['APP_EMAIL_FROM_ADDRESS'] ?? 'utilities@example.com';
    $appEmailFromName = $_ENV['APP_EMAIL_FROM_NAME'] ?? '77 N Union Utilities';
    $appConfirmationEmailTo = $_ENV['APP_CONFIRMATION_EMAIL_TO'] ?? 'admin@example.com';
    include_once __DIR__ . '/includes/helpers.php';

    // Fetch bill details from the database (fldOwe is no longer in tblUtilities).
    $billDetailsStmt = $pdo->prepare(
        'SELECT pmkBillID, fldDue, fldItem, fldTotal, fldCost
         FROM tblUtilities WHERE pmkBillID = :id'
    );
    $billDetailsStmt->execute([':id' => $billId]);
    $bill = $billDetailsStmt->fetch(PDO::FETCH_ASSOC);

    if ($bill) {
        $billDueDate = $bill['fldDue'];
        $billItem = $bill['fldItem'];
        $billTotal = (float)$bill['fldTotal'];
        $billCostPerPerson = (float)$bill['fldCost'];

        // Fetch people who owe for this specific bill from tblBillOwes and tblPeople.
        $peopleOwingStmt = $pdo->prepare("
            SELECT p.personName
            FROM tblPeople p
            JOIN tblBillOwes bo ON p.personID = bo.personID
            WHERE bo.billID = :billID
        ");
        $peopleOwingStmt->execute([':billID' => $billId]);
        // Get a list of names of people who owe for this bill.
        $owedPeopleNameList = $peopleOwingStmt->fetchAll(PDO::FETCH_COLUMN);

        // Determine subject urgency based on due date.
        try {
            $dueDateObj = new DateTime($billDueDate);
            $todayObj = new DateTime();
            $intervalDays = $todayObj > $dueDateObj ? 0 : $todayObj->diff($dueDateObj)->days;
        } catch (Exception $e) {
            error_log("Error parsing due date '{$billDueDate}' for bill ID {$billId}: " . $e->getMessage());
            $intervalDays = 0;
        }

        $subject = ($intervalDays <= 3)
            ? "URGENT: Reminder - " . htmlspecialchars($billItem) . " Bill Due Soon"
            : "Reminder: " . htmlspecialchars($billItem) . " Bill Due";

        $portalLink = $appBaseUrl . '/index.php';
        $sentToForConfirmation = [];

        if (empty($owedPeopleNameList)) {
            error_log("No one currently owes for bill ID {$billId} (Item: {$billItem}). No reminders sent.");
        }


        foreach ($owedPeopleNameList as $personName) {
            if (empty($personName) || !isset($emailMapArray[$personName])) {
                error_log("Skipping reminder for '{$personName}' (Bill ID: {$billId}): name is empty or not in email map.");
                continue;
            }
            $toEmailAddress = $emailMapArray[$personName];

            $formattedDueDate = "";
            try {
                $dateObjForBody = new DateTime($billDueDate);
                $formattedDueDate = $dateObjForBody->format("F j, Y");
            } catch(Exception $e){
                $formattedDueDate = $billDueDate;
            }

            $bodyHeader = "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,\'Helvetica Neue\',Arial; color:#0f1724;\">";
            $bodyMain = "<h2 style=\"margin:0 0 8px 0; font-size:18px; color:#111827;\">Reminder: " . htmlspecialchars($billItem) . "</h2>";
            $bodyMain .= "<p style=\"margin:0 0 8px 0; color:#374151; font-size:14px;\">Hello " . htmlspecialchars($personName) . ",</p>";
            $bodyMain .= "<p style=\"margin:0 0 8px 0; color:#374151; font-size:14px;\">This is a reminder that your <strong>" . htmlspecialchars($billItem) . "</strong> bill (total: $" . number_format($billTotal, 2) . ") is due on <strong>" . htmlspecialchars($formattedDueDate) . "</strong>. Your share: <strong>$" . number_format($billCostPerPerson, 2) . "</strong>.</p>";
            $bodyMain .= "<p style=\"margin:0 0 12px 0;\"><a href=\"" . htmlspecialchars($portalLink) . "\" style=\"display:inline-block;padding:8px 12px;background:#3B82F6;color:#fff;border-radius:8px;text-decoration:none;\">View details</a></p>";
            $bodyFooter = "<hr style=\"border:none;border-top:1px solid #eef2ff;margin:12px 0;\"><p style=\"margin:0;color:#6b7280;font-size:13px;\">" . htmlspecialchars($appEmailFromName) . " — <a href=\"mailto:" . htmlspecialchars($appEmailFromAddress) . "\">" . htmlspecialchars($appEmailFromAddress) . "</a></p>";
            $body = $bodyHeader . $bodyMain . $bodyFooter . "</div>";

            if (sendSmtpMail($toEmailAddress, $subject, $body)) {
                $sentToForConfirmation[] = htmlspecialchars($personName) . " &lt;" . htmlspecialchars($toEmailAddress) . "&gt;";
            }
        }

        if (!empty($owedPeopleNameList) && !empty($appConfirmationEmailTo)) {
            $confirmSubject = "Reminder Batch Processed: " . htmlspecialchars($billItem) . " due " . htmlspecialchars($billDueDate);
            $processedListStr = empty($sentToForConfirmation) ? 'None (or all failed, check logs)' : implode(', ', $sentToForConfirmation);

            $confirmBody = "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#111827;\">"
                . "<h3 style=\"margin:0 0 8px 0;\">Reminder Batch Report</h3>"
                . "<p style=\"margin:6px 0 10px 0;color:#374151;\">Bill: <strong>" . htmlspecialchars($billItem) . "</strong> — Due: <strong>" . htmlspecialchars($billDueDate) . "</strong></p>"
                . "<p style=\"margin:6px 0 10px 0;color:#374151;\"><strong>Processed recipients:</strong></p>"
                . "<p style=\"margin:0 0 8px 0;color:#374151;\">" . $processedListStr . "</p>"
                . "<hr style=\"border:none;border-top:1px solid #eef2ff;margin:12px 0;\">"
                . "<p style=\"margin:0;color:#6b7280;font-size:13px;\">Original Subject: " . htmlspecialchars($subject) . "</p>"
                . "</div>";

            if (filter_var($appConfirmationEmailTo, FILTER_VALIDATE_EMAIL)) {
                sendSmtpMail($appConfirmationEmailTo, $confirmSubject, $confirmBody);
            }
        }
    } else {
        error_log("Bill with ID {$billId} not found for sending reminder.");
    }

    $_SESSION['success_message'] = "Reminders for bill '" . htmlspecialchars($billItem ?? 'Unknown') . "' processed.";


    // Redirect back to the referring page (likely portal.php).
    header('Location: ' . ($_SERVER['HTTP_REFERER'] ?? 'portal.php'));
    exit; // Ensure script termination.
}
// If script is accessed without POST 'sendReminder', it does nothing and exits.
?>