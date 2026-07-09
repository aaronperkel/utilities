<?php
/**
 * Email Preview: Reminder Email
 * 
 * This page renders the reminder email template with sample data
 * so you can preview and edit the design before sending actual emails.
 * 
 * Edit the HTML below to change the email appearance.
 * Changes here should also be applied to send_reminder.php.
 */

// Sample data for preview
$personName = "Alex";
$billItem = "Electric";
$billTotal = 142.50;
$billCostPerPerson = 47.50;
$formattedDueDate = "January 15, 2025";
$portalLink = "https://utilities.example.com/index.php";
$appEmailFromName = "77 N Union Utilities";
$appEmailFromAddress = "utilities@example.com";
$isUrgent = isset($_GET['urgent']); // Add ?urgent to URL to preview urgent version

// Allow overriding sample values via query params for testing
if (!empty($_GET['name'])) $personName = htmlspecialchars($_GET['name']);
if (!empty($_GET['item'])) $billItem = htmlspecialchars($_GET['item']);
if (!empty($_GET['total'])) $billTotal = floatval($_GET['total']);
if (!empty($_GET['cost'])) $billCostPerPerson = floatval($_GET['cost']);
if (!empty($_GET['due'])) $formattedDueDate = htmlspecialchars($_GET['due']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Preview: Reminder</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 20px;
            background: #1a1f2e;
            font-family: system-ui, -apple-system, sans-serif;
            min-height: 100vh;
        }
        .preview-controls {
            max-width: 600px;
            margin: 0 auto 20px;
            padding: 16px;
            background: #0f1724;
            border-radius: 12px;
            color: #94a3b8;
        }
        .preview-controls h1 {
            margin: 0 0 12px;
            font-size: 18px;
            color: #fff;
        }
        .preview-controls p {
            margin: 0 0 12px;
            font-size: 14px;
            line-height: 1.5;
        }
        .preview-controls .badge {
            display: inline-block;
            padding: 4px 10px;
            background: linear-gradient(135deg, #7C4DFF, #5B8DEF);
            color: #fff;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .preview-controls .toggle-link {
            color: #7C4DFF;
            text-decoration: none;
            font-size: 14px;
        }
        .preview-controls .toggle-link:hover {
            text-decoration: underline;
        }
        .email-frame {
            max-width: 600px;
            margin: 0 auto;
            background: #fff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .email-header {
            background: #f8fafc;
            padding: 12px 20px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
            color: #64748b;
        }
        .email-header strong {
            color: #334155;
        }
        .email-content {
            padding: 24px;
        }
    </style>
</head>
<body>
    <div class="preview-controls">
        <h1>📧 Email Preview: Reminder</h1>
        <p>
            <span class="badge"><?= $isUrgent ? 'URGENT' : 'NORMAL' ?></span>
            <?php if ($isUrgent): ?>
                <a href="?<?= http_build_query(array_diff_key($_GET, ['urgent' => ''])) ?>" class="toggle-link">View normal version</a>
            <?php else: ?>
                <a href="?<?= http_build_query(array_merge($_GET, ['urgent' => '1'])) ?>" class="toggle-link">View urgent version</a>
            <?php endif; ?>
        </p>
        <p>This is a preview of the reminder email. Edit <code>send_reminder.php</code> to change the actual email template.</p>
        <p style="font-size:12px;color:#64748b;">
            Query params: <code>?name=X&item=X&total=X&cost=X&due=X&urgent</code>
        </p>
    </div>

    <div class="email-frame">
        <div class="email-header">
            <strong>From:</strong> <?= htmlspecialchars($appEmailFromName) ?> &lt;<?= htmlspecialchars($appEmailFromAddress) ?>&gt;<br>
            <strong>To:</strong> <?= htmlspecialchars($personName) ?> &lt;<?= strtolower($personName) ?>@example.com&gt;<br>
            <strong>Subject:</strong> <?= $isUrgent ? 'URGENT: Reminder - ' : 'Reminder: ' ?><?= htmlspecialchars($billItem) ?> Bill<?= $isUrgent ? ' Due Soon' : ' Due' ?>
        </div>
        <div class="email-content">
            <!-- ========================================
                 EMAIL TEMPLATE STARTS HERE
                 Copy changes to send_reminder.php
            ======================================== -->
            <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial; color:#0f1724;">
                <h2 style="margin:0 0 8px 0; font-size:18px; color:#111827;">Reminder: <?= htmlspecialchars($billItem) ?></h2>
                <p style="margin:0 0 8px 0; color:#374151; font-size:14px;">Hello <?= htmlspecialchars($personName) ?>,</p>
                <p style="margin:0 0 8px 0; color:#374151; font-size:14px;">This is a reminder that your <strong><?= htmlspecialchars($billItem) ?></strong> bill (total: $<?= number_format($billTotal, 2) ?>) is due on <strong><?= htmlspecialchars($formattedDueDate) ?></strong>. Your share: <strong>$<?= number_format($billCostPerPerson, 2) ?></strong>.</p>
                <p style="margin:0 0 12px 0;">
                    <a href="<?= htmlspecialchars($portalLink) ?>" style="display:inline-block;padding:8px 12px;background:linear-gradient(90deg, #7C4DFF, #5B8DEF);color:#fff;border-radius:8px;text-decoration:none;">View details</a>
                </p>
                <hr style="border:none;border-top:1px solid #eef2ff;margin:12px 0;">
                <p style="margin:0;color:#6b7280;font-size:13px;"><?= htmlspecialchars($appEmailFromName) ?> — <a href="mailto:<?= htmlspecialchars($appEmailFromAddress) ?>"><?= htmlspecialchars($appEmailFromAddress) ?></a></p>
            </div>
            <!-- ========================================
                 EMAIL TEMPLATE ENDS HERE
            ======================================== -->
        </div>
    </div>
</body>
</html>
