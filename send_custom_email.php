<?php
// send_custom_email.php
// Allows an admin user to send a custom-composed email to all users defined in the email map.
// Note: This script currently lacks CSRF protection for the form submission.

session_start(); // Start session to potentially use for CSRF tokens or admin checks if refactored.
include 'top.php'; // Includes header, nav, and DB connection (which loads .env variables).

requireAdmin();

// --- Configuration Loading ---
$appEmailFromAddress    = $_ENV['APP_EMAIL_FROM_ADDRESS']    ?? 'utilities@example.com';
$appEmailFromName       = $_ENV['APP_EMAIL_FROM_NAME']       ?? '77 N Union Utilities';
$appConfirmationEmailTo = $_ENV['APP_CONFIRMATION_EMAIL_TO'] ?? 'admin@example.com';
$emailMapArray          = getEmailMap();


if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_POST['csrf_token'], $_SESSION['csrf_token_custom_email'])
        || !hash_equals($_SESSION['csrf_token_custom_email'], $_POST['csrf_token'])) {
        die("CSRF token validation failed.");
    }
    $_SESSION['csrf_token_custom_email'] = bin2hex(random_bytes(32));

    $error_messages = [];

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

        // 4) Use the configured email map for recipients.
        $sentToForConfirmation = [];

        if (!empty($emailMapArray)) {
            foreach ($emailMapArray as $name => $toEmailAddress) {
                if (empty($toEmailAddress) || !filter_var($toEmailAddress, FILTER_VALIDATE_EMAIL)) {
                    error_log("Invalid email address for {$name}: {$toEmailAddress}. Skipping custom email.");
                    continue;
                }
                if (sendSmtpMail($toEmailAddress, $subject, $htmlBody)) {
                    $sentToForConfirmation[] = htmlspecialchars($name) . " &lt;" . htmlspecialchars($toEmailAddress) . "&gt;";
                }
            }
        } else {
            error_log("Email map is empty. No custom emails sent.");
            $error_messages[] = "No recipients configured. Email not sent.";
        }

        if (!empty($appConfirmationEmailTo) && filter_var($appConfirmationEmailTo, FILTER_VALIDATE_EMAIL)) {
            $sentListStr = empty($sentToForConfirmation) ? 'None (or all failed, check logs)' : implode(', ', $sentToForConfirmation);
            $confirmSubject = 'Admin Confirmation: Custom Email Sent';
            $confirmBodyNice = "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;\">"
                . "<h3 style=\"margin:0 0 8px 0;\">Admin Confirmation: Custom Email Sent</h3>"
                . "<p style=\"margin:6px 0 10px 0;color:#374151;\"><b>Subject:</b> " . htmlspecialchars($subject) . "</p>"
                . "<p style=\"margin:6px 0 10px 0;color:#374151;\"><b>Sent to:</b> " . $sentListStr . "</p>"
                . "<hr style=\"border:none;border-top:1px solid #eef2ff;margin:12px 0;\">"
                . "<h4 style=\"margin:0 0 8px 0;\">Message Preview</h4>" . $htmlBody
                . "</div>";
            sendSmtpMail($appConfirmationEmailTo, $confirmSubject, $confirmBodyNice);
        }

        if (empty($error_messages)) {
            $_SESSION['success_message'] = "Custom email has been dispatched.";
            header('Location: portal.php');
            exit;
        }
    }
}

// Values for form repopulation
$formSubject = $_POST['subject'] ?? '';
$formBody = $_POST['body'] ?? '';

if (empty($_SESSION['csrf_token_custom_email'])) {
    $_SESSION['csrf_token_custom_email'] = bin2hex(random_bytes(32));
}
$csrfTokenCustomEmail = $_SESSION['csrf_token_custom_email'];
?>

<main class="form-area">
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

    <?php
    // Display success message from session if redirected from portal.php (less common for this page)
    if (isset($_SESSION['success_message'])) {
        echo '<div class="messages success-messages"><ul><li>' . htmlspecialchars($_SESSION['success_message']) . '</li></ul></div>';
        unset($_SESSION['success_message']);
    }
    ?>

    <div class="form-panel">
        <form method="POST" action="send_custom_email.php">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfTokenCustomEmail) ?>">
            <label for="subject">Subject</label>
            <input type="text" id="subject" name="subject" value="<?= htmlspecialchars($formSubject) ?>" required>

            <label for="body">Message</label>
            <textarea id="body" name="body" rows="6" required><?= htmlspecialchars($formBody) ?></textarea>

            <button type="submit" class="btn btn-primary" aria-label="Send custom email">Send Email</button>
        </form>
    </div>
</main>

<?php include 'footer.php'; ?>