<?php
// send_custom_email.php
// Allows an admin user to send a custom-composed email to all users defined in the email map.
// Note: This script currently lacks CSRF protection for the form submission.

session_start(); // Start session to potentially use for CSRF tokens or admin checks if refactored.
include 'top.php'; // Includes header, nav, and DB connection (which loads .env variables).

// --- Admin Access Check ---
// Uses isAdminUser function (defined in connect-DB.php, included via top.php)
// and APP_ADMIN_USERS list from .env.
$appAdminUsersStr = $_ENV['APP_ADMIN_USERS'] ?? '';
$appAdminUsersList = !empty($appAdminUsersStr) ? array_map('trim', explode(',', $appAdminUsersStr)) : [];
$currentRemoteUser = $_SERVER['REMOTE_USER'] ?? '';

if (!isAdminUser($currentRemoteUser, $appAdminUsersList)) {
    die("Access denied. User '" . htmlspecialchars($currentRemoteUser) . "' is not authorized for this page.");
}

// --- Configuration Loading (from .env, loaded by connect-DB.php in top.php) ---
$appEmailFromAddress = $_ENV['APP_EMAIL_FROM_ADDRESS'] ?? 'utilities@example.com';
$appEmailFromName = $_ENV['APP_EMAIL_FROM_NAME'] ?? '81 Buell Utilities';
$appConfirmationEmailTo = $_ENV['APP_CONFIRMATION_EMAIL_TO'] ?? 'admin@example.com';

$userEmailsJson = $_ENV['APP_USER_EMAILS'] ?? '{}';
$emailMapArray = json_decode($userEmailsJson, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    error_log("Failed to parse APP_USER_EMAILS JSON in send_custom_email.php: " . json_last_error_msg());
    $emailMapArray = []; // Default to empty map on error to prevent email sending issues.
}


if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // TODO: Implement CSRF token generation and validation here.
    // Example:
    // if (!isset($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token_custom_email'], $_POST['csrf_token'])) {
    //     die("CSRF token validation failed.");
    // }
    // $_SESSION['csrf_token_custom_email'] = bin2hex(random_bytes(32)); // Regenerate after use or on form display.

    $is_dry_run_active = isDryRunActive();
    $dry_run_messages = [];
    $error_messages = []; // For any validation errors, though basic for this form.

    // 1) Get inputs from the form.
    $subject = trim($_POST['subject'] ?? '');
    $bodyRaw = trim($_POST['body'] ?? '');

    // Basic validation
    if (empty($subject)) {
        $error_messages[] = "Subject cannot be empty.";
    }
    if (empty($bodyRaw)) {
        $error_messages[] = "Message body cannot be empty.";
    }

    if (empty($error_messages)) {
        // 2) Process raw body text into HTML:
        //    - Split text into paragraphs based on one or more empty lines.
        //    - Convert single newlines within paragraphs to <br> tags.
        //    - HTML escape paragraph content to prevent XSS.
        $paras = preg_split('/\R\R+/', $bodyRaw, -1, PREG_SPLIT_NO_EMPTY);
        $htmlBody = '';
        foreach ($paras as $p) {
            $cleanParagraph = htmlspecialchars($p, ENT_QUOTES, 'UTF-8');
            $cleanParagraphWithBreaks = nl2br($cleanParagraph); // Convert newlines to <br>
            $htmlBody .= "<p style=\"margin:0 0 12px 0;color:#374151;font-size:14px;line-height:1.4;\">{$cleanParagraphWithBreaks}</p>\n";
        }

        // 3) Append a modern signature (using configured details).
        $htmlBody .= "<hr style=\"border:none;border-top:1px solid #eef2ff;margin:18px 0;\">";
        $htmlBody .= "<p style=\"margin:0;color:#6b7280;font-size:13px;\">" . htmlspecialchars($appEmailFromName) . " — <a href=\"mailto:" . htmlspecialchars($appEmailFromAddress) . "\">" . htmlspecialchars($appEmailFromAddress) . "</a></p>";

        // 4) Prepare email headers using configured "From" address and name.
        $fromHeader = "From: " . htmlspecialchars($appEmailFromName) . " <" . htmlspecialchars($appEmailFromAddress) . ">";
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= $fromHeader . "\r\n";

        // 5) Use the configured email map for recipients.
        // $emailMapArray is already loaded from .env.

        $sentToForConfirmation = []; // For admin confirmation.
        $recipientsForDryRun = [];

        if ($is_dry_run_active) {
            $dry_run_messages[] = "DRY RUN: Custom Email Simulation";
            $dry_run_messages[] = "Subject: " . htmlspecialchars($subject);
            if (!empty($emailMapArray)) {
                foreach ($emailMapArray as $name => $toEmailAddress) {
                    if (!empty($toEmailAddress) && filter_var($toEmailAddress, FILTER_VALIDATE_EMAIL)) {
                        $recipientsForDryRun[] = htmlspecialchars($name) . " (" . htmlspecialchars($toEmailAddress) . ")";
                    }
                }
                $dry_run_messages[] = "Would be sent to: " . implode(', ', $recipientsForDryRun);
            } else {
                $dry_run_messages[] = "No recipients found in APP_USER_EMAILS configuration.";
            }
            if (!empty($appConfirmationEmailTo) && filter_var($appConfirmationEmailTo, FILTER_VALIDATE_EMAIL)) {
                $dry_run_messages[] = "Admin confirmation would be sent to: " . htmlspecialchars($appConfirmationEmailTo);
            }
            // No redirect in dry run, messages will be displayed.
        } else {
            // LIVE MODE: Send emails
            if (!empty($emailMapArray)) {
                foreach ($emailMapArray as $name => $toEmailAddress) {
                    if (empty($toEmailAddress) || !filter_var($toEmailAddress, FILTER_VALIDATE_EMAIL)) {
                        error_log("Invalid email address for {$name}: {$toEmailAddress}. Skipping custom email.");
                        continue;
                    }
                        if (!mail($toEmailAddress, $subject, $htmlBody, $headers)) {
                            error_log("Custom email to {$toEmailAddress} (for {$name}) with subject '{$subject}' failed to send.");
                        } else {
                            $sentToForConfirmation[] = htmlspecialchars($name) . " &lt;" . htmlspecialchars($toEmailAddress) . "&gt;";
                        }
                }
            } else {
                error_log("APP_USER_EMAILS is empty or invalid. No custom emails sent.");
                $error_messages[] = "No recipients configured. Email not sent.";
            }

            // Send a confirmation email to the admin, if configured and not in dry run.
            if (!empty($appConfirmationEmailTo) && filter_var($appConfirmationEmailTo, FILTER_VALIDATE_EMAIL)) {
                $sentListStr = empty($sentToForConfirmation) ? 'None (or all failed, check logs)' : implode(', ', $sentToForConfirmation);
                $confirmSubject = 'Admin Confirmation: Custom Email Sent';
                $confirmBody = "<p style=\"font:12pt monospace;\">A custom email was sent from the portal.</p>"
                    . "<p style=\"font:12pt monospace;\"><b>Subject:</b> " . htmlspecialchars($subject) . "</p>"
                    . "<p style=\"font:12pt monospace;\"><b>Attempted to send to:</b> {$sentListStr}</p>"
                    . "<hr><h3>Original Message Body (HTML):</h3>" . $htmlBody;

                // Admin confirmation: single consolidated message with recipient list
                $sentListStr = empty($sentToForConfirmation) ? 'None (or all failed, check logs)' : implode(', ', $sentToForConfirmation);
                $confirmBodyNice = "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;\">"
                    . "<h3 style=\"margin:0 0 8px 0;\">Admin Confirmation: Custom Email Sent</h3>"
                    . "<p style=\"margin:6px 0 10px 0;color:#374151;\"><b>Subject:</b> " . htmlspecialchars($subject) . "</p>"
                    . "<p style=\"margin:6px 0 10px 0;color:#374151;\"><b>Sent to:</b> " . $sentListStr . "</p>"
                    . "<hr style=\"border:none;border-top:1px solid #eef2ff;margin:12px 0;\">"
                    . "<h4 style=\"margin:0 0 8px 0;\">Message Preview</h4>" . $htmlBody
                    . "</div>";
                if (!mail($appConfirmationEmailTo, $confirmSubject, $confirmBodyNice, $headers)) {
                    error_log("Admin confirmation for custom email failed to send to {$appConfirmationEmailTo}.");
                }
            }

            if (empty($error_messages)) { // Only redirect if no errors occurred during sending.
                $_SESSION['success_message'] = "Custom email has been dispatched.";
                header('Location: portal.php');
                exit;
            }
        }
    }
}

// Values for form repopulation (used on GET and on POST if errors or dry run)
$formSubject = $_POST['subject'] ?? '';
$formBody = $_POST['body'] ?? '';

// TODO: Generate and include CSRF token in the form below for POST requests.
// Example: $csrfTokenCustomEmail = $_SESSION['csrf_token_custom_email'] = bin2hex(random_bytes(32));
/* Then add: <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfTokenCustomEmail) ?>"> */
?>

<main class="form-area">
    <?php if (isDryRunActive()): // Use function defined in connect-DB.php ?>
        <div class="messages dry-run-banner">
            <strong>TESTING/DRY-RUN MODE IS CURRENTLY ACTIVE.</strong> Emails will not actually be sent.
        </div>
    <?php endif; ?>

    <h2 class="section-title">Send Custom Email to All Users</h2>

    <?php if (!empty($error_messages)): ?>
        <div class="messages error-messages">
            <strong>Please correct the following errors:</strong>
            <ul>
                <?php foreach ($error_messages as $msg): ?>
                    <li><?= htmlspecialchars($msg) ?></li>
                <?php endforeach; ?>
            </ul>
        </div>
    <?php endif; ?>

    <?php if (!empty($dry_run_messages)): ?>
        <div class="messages dry-run-info">
            <strong>Dry Run Information (No emails were sent):</strong>
            <ul>
                <?php foreach ($dry_run_messages as $msg): ?>
                    <li><?= htmlspecialchars($msg) // Messages are already HTML safe or pre-escaped ?></li>
                <?php endforeach; ?>
            </ul>
        </div>
    <?php endif; ?>

    <?php
    // Display success message from session if redirected from portal.php (less common for this page)
    if (isset($_SESSION['success_message'])) {
        echo '<div class="messages success-messages"><ul><li>' . htmlspecialchars($_SESSION['success_message']) . '</li></ul></div>';
        unset($_SESSION['success_message']);
    }
    ?>

    <div class="form-panel">
        <form method="POST" action="send_custom_email.php">
            <label for="subject">Subject</label>
            <input type="text" id="subject" name="subject" value="<?= htmlspecialchars($formSubject) ?>" required>

            <label for="body">Message</label>
            <textarea id="body" name="body" rows="6" required><?= htmlspecialchars($formBody) ?></textarea>

            <button type="submit" class="btn btn-primary" aria-label="Send custom email">Send Email</button>
        </form>
    </div>
</main>

<?php include 'footer.php'; ?>