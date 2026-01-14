<?php
/**
 * Email Previews Index
 * 
 * Directory of all email template previews.
 * Use these pages to design and test email templates
 * before deploying changes to the actual send scripts.
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Previews</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 40px 20px;
            background: #0f1724;
            font-family: system-ui, -apple-system, sans-serif;
            min-height: 100vh;
            color: #e2e8f0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        h1 {
            margin: 0 0 8px;
            font-size: 28px;
            background: linear-gradient(135deg, #7C4DFF, #5B8DEF);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .subtitle {
            color: #94a3b8;
            margin: 0 0 32px;
            font-size: 14px;
        }
        .card {
            background: #1e293b;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
            border: 1px solid #334155;
            transition: border-color 0.2s, transform 0.2s;
        }
        .card:hover {
            border-color: #7C4DFF;
            transform: translateY(-2px);
        }
        .card h2 {
            margin: 0 0 8px;
            font-size: 18px;
            color: #fff;
        }
        .card p {
            margin: 0 0 16px;
            color: #94a3b8;
            font-size: 14px;
            line-height: 1.5;
        }
        .card .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            margin-right: 8px;
        }
        .badge-reminder { background: #7C4DFF22; color: #a78bfa; }
        .badge-newbill { background: #10b98122; color: #34d399; }
        .badge-custom { background: #f59e0b22; color: #fbbf24; }
        .card a {
            display: inline-block;
            padding: 8px 16px;
            background: linear-gradient(135deg, #7C4DFF, #5B8DEF);
            color: #fff;
            text-decoration: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            transition: opacity 0.2s;
        }
        .card a:hover {
            opacity: 0.9;
        }
        .tip {
            background: #1e293b;
            border-left: 3px solid #7C4DFF;
            padding: 16px;
            border-radius: 0 8px 8px 0;
            margin-top: 32px;
        }
        .tip h3 {
            margin: 0 0 8px;
            font-size: 14px;
            color: #fff;
        }
        .tip p {
            margin: 0;
            font-size: 13px;
            color: #94a3b8;
            line-height: 1.5;
        }
        .tip code {
            background: #0f172a;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            color: #7C4DFF;
        }
        .back-link {
            display: inline-block;
            margin-top: 24px;
            color: #7C4DFF;
            text-decoration: none;
            font-size: 14px;
        }
        .back-link:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📧 Email Previews</h1>
        <p class="subtitle">Design and test email templates before sending</p>

        <div class="card">
            <h2><span class="badge badge-reminder">Reminder</span> Bill Reminder</h2>
            <p>The reminder email sent to users who haven't paid their share of a bill. Includes urgent variant for bills due within 3 days.</p>
            <a href="reminder.php">Preview →</a>
        </div>

        <div class="card">
            <h2><span class="badge badge-newbill">New</span> New Bill Notification</h2>
            <p>Notification email when a new bill is added to the portal. Shows bill details in a clean card format.</p>
            <a href="newbill.php">Preview →</a>
        </div>

        <div class="card">
            <h2><span class="badge badge-custom">Custom</span> Custom Email</h2>
            <p>Preview of admin-composed custom emails sent to all users. Shows how plain text is formatted into HTML.</p>
            <a href="custom.php">Preview →</a>
        </div>

        <div class="tip">
            <h3>💡 How to use</h3>
            <p>
                Edit the email templates in these preview files, then copy the changes to the corresponding send scripts 
                (<code>send_reminder.php</code>, <code>send_custom_email.php</code>, etc.). 
                Use query parameters like <code>?name=John&item=Gas</code> to test with different values.
            </p>
        </div>

        <a href="../portal.php" class="back-link">← Back to Portal</a>
    </div>
</body>
</html>
