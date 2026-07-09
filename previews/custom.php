<?php
/**
 * Email Preview: Custom Email
 * 
 * This page renders the custom email template with sample data
 * so you can preview the design that send_custom_email.php uses.
 * 
 * Edit the HTML below to change the email appearance.
 * Changes here should also be applied to send_custom_email.php.
 */

// Sample data for preview
$subject = "Monthly Utility Update";
$appEmailFromName = "77 N Union Utilities";
$appEmailFromAddress = "utilities@example.com";

// Sample message body (what an admin might type)
$sampleBodyRaw = "Hey everyone!

Just a quick update on utilities for this month. The electric bill came in a bit higher than usual due to the cold weather, but gas was actually lower.

Please make sure to pay your share by the 15th. You can check what you owe on the portal.

Thanks!";

// Allow overriding via query param
if (!empty($_GET['subject'])) $subject = htmlspecialchars($_GET['subject']);

// Process raw body into HTML (same logic as send_custom_email.php)
$paras = preg_split('/\R\R+/', $sampleBodyRaw, -1, PREG_SPLIT_NO_EMPTY);
$htmlBody = '';
foreach ($paras as $p) {
    $cleanParagraph = htmlspecialchars($p, ENT_QUOTES, 'UTF-8');
    $cleanParagraphWithBreaks = nl2br($cleanParagraph);
    $htmlBody .= "<p style=\"margin:0 0 12px 0;color:#374151;font-size:14px;line-height:1.4;\">{$cleanParagraphWithBreaks}</p>\n";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Preview: Custom Email</title>
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
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: #fff;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
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
        <h1>📧 Email Preview: Custom Email</h1>
        <p><span class="badge">CUSTOM</span></p>
        <p>This is a preview of custom emails sent via the admin portal. Edit <code>send_custom_email.php</code> to change the actual email formatting.</p>
        <p style="font-size:12px;color:#64748b;">
            Query params: <code>?subject=X</code>
        </p>
    </div>

    <div class="email-frame">
        <div class="email-header">
            <strong>From:</strong> <?= htmlspecialchars($appEmailFromName) ?> &lt;<?= htmlspecialchars($appEmailFromAddress) ?>&gt;<br>
            <strong>To:</strong> All Users<br>
            <strong>Subject:</strong> <?= htmlspecialchars($subject) ?>
        </div>
        <div class="email-content">
            <!-- ========================================
                 EMAIL TEMPLATE STARTS HERE
                 Copy changes to send_custom_email.php
            ======================================== -->
            <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial; color:#0f1724;">
                <?= $htmlBody ?>
                <hr style="border:none;border-top:1px solid #eef2ff;margin:18px 0;">
                <p style="margin:0;color:#6b7280;font-size:13px;"><?= htmlspecialchars($appEmailFromName) ?> — <a href="mailto:<?= htmlspecialchars($appEmailFromAddress) ?>" style="color:#7C4DFF;"><?= htmlspecialchars($appEmailFromAddress) ?></a></p>
            </div>
            <!-- ========================================
                 EMAIL TEMPLATE ENDS HERE
            ======================================== -->
        </div>
    </div>
</body>
</html>
