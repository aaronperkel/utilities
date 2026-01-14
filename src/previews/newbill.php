<?php
/**
 * Email Preview: New Bill Notification
 * 
 * This page renders a "new bill added" notification email template.
 * Use this as a reference when creating a new bill notification feature.
 * 
 * Edit the HTML below to design the email appearance.
 */

// Sample data for preview
$personName = "Alex";
$billItem = "Electric";
$billTotal = 142.50;
$billCostPerPerson = 47.50;
$billDueDate = "January 15, 2025";
$billAddedDate = date("F j, Y"); // Today
$portalLink = "https://utilities.example.com/index.php";
$appEmailFromName = "81 Buell Utilities";
$appEmailFromAddress = "utilities@example.com";

// Allow overriding sample values via query params for testing
if (!empty($_GET['name'])) $personName = htmlspecialchars($_GET['name']);
if (!empty($_GET['item'])) $billItem = htmlspecialchars($_GET['item']);
if (!empty($_GET['total'])) $billTotal = floatval($_GET['total']);
if (!empty($_GET['cost'])) $billCostPerPerson = floatval($_GET['cost']);
if (!empty($_GET['due'])) $billDueDate = htmlspecialchars($_GET['due']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Preview: New Bill</title>
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
            background: linear-gradient(135deg, #10b981, #059669);
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
        <h1>📧 Email Preview: New Bill Notification</h1>
        <p><span class="badge">NEW</span></p>
        <p>This is a preview of the new bill notification email. This template can be used when adding new bill notification functionality.</p>
        <p style="font-size:12px;color:#64748b;">
            Query params: <code>?name=X&item=X&total=X&cost=X&due=X</code>
        </p>
    </div>

    <div class="email-frame">
        <div class="email-header">
            <strong>From:</strong> <?= htmlspecialchars($appEmailFromName) ?> &lt;<?= htmlspecialchars($appEmailFromAddress) ?>&gt;<br>
            <strong>To:</strong> <?= htmlspecialchars($personName) ?> &lt;<?= strtolower($personName) ?>@example.com&gt;<br>
            <strong>Subject:</strong> New Bill: <?= htmlspecialchars($billItem) ?> - $<?= number_format($billCostPerPerson, 2) ?> due <?= htmlspecialchars($billDueDate) ?>
        </div>
        <div class="email-content">
            <!-- ========================================
                 EMAIL TEMPLATE STARTS HERE
                 Implement in a send_newbill.php when ready
            ======================================== -->
            <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial; color:#0f1724;">
                <h2 style="margin:0 0 8px 0; font-size:18px; color:#111827;">
                    <span style="display:inline-block;padding:2px 8px;background:#dcfce7;color:#166534;border-radius:4px;font-size:12px;font-weight:600;vertical-align:middle;margin-right:6px;">NEW</span>
                    <?= htmlspecialchars($billItem) ?> Bill Added
                </h2>
                
                <p style="margin:12px 0 8px 0; color:#374151; font-size:14px;">Hello <?= htmlspecialchars($personName) ?>,</p>
                
                <p style="margin:0 0 16px 0; color:#374151; font-size:14px;">A new bill has been added to the utilities portal:</p>
                
                <!-- Bill Details Card -->
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 16px 0;">
                    <table style="width:100%;border-collapse:collapse;font-size:14px;">
                        <tr>
                            <td style="padding:4px 0;color:#64748b;">Bill Type</td>
                            <td style="padding:4px 0;color:#111827;font-weight:600;text-align:right;"><?= htmlspecialchars($billItem) ?></td>
                        </tr>
                        <tr>
                            <td style="padding:4px 0;color:#64748b;">Total Amount</td>
                            <td style="padding:4px 0;color:#111827;font-weight:600;text-align:right;">$<?= number_format($billTotal, 2) ?></td>
                        </tr>
                        <tr>
                            <td style="padding:4px 0;color:#64748b;">Your Share</td>
                            <td style="padding:4px 0;color:#7C4DFF;font-weight:700;text-align:right;">$<?= number_format($billCostPerPerson, 2) ?></td>
                        </tr>
                        <tr>
                            <td style="padding:4px 0;color:#64748b;">Due Date</td>
                            <td style="padding:4px 0;color:#111827;font-weight:600;text-align:right;"><?= htmlspecialchars($billDueDate) ?></td>
                        </tr>
                    </table>
                </div>
                
                <p style="margin:0 0 16px 0;">
                    <a href="<?= htmlspecialchars($portalLink) ?>" style="display:inline-block;padding:10px 20px;background:linear-gradient(90deg, #7C4DFF, #5B8DEF);color:#fff;border-radius:8px;text-decoration:none;font-weight:500;">View in Portal</a>
                </p>
                
                <hr style="border:none;border-top:1px solid #eef2ff;margin:16px 0;">
                <p style="margin:0;color:#6b7280;font-size:13px;"><?= htmlspecialchars($appEmailFromName) ?> — <a href="mailto:<?= htmlspecialchars($appEmailFromAddress) ?>" style="color:#7C4DFF;"><?= htmlspecialchars($appEmailFromAddress) ?></a></p>
            </div>
            <!-- ========================================
                 EMAIL TEMPLATE ENDS HERE
            ======================================== -->
        </div>
    </div>
</body>
</html>
