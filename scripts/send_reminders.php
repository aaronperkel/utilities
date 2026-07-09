<?php
/**
 * scripts/send_reminders.php
 *
 * Cron script: queries unpaid bills and sends SMTP email reminders.
 *
 * Cron (UVM silk):
 *   0 10 * * * /opt/mise/installs/php/8.2/bin/php /users/a/p/aperkel/utilities.aperkel.w3.uvm.edu-root/scripts/send_reminders.php >> /users/a/p/aperkel/cron.log 2>&1
 */

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../connect-DB.php'; // provides $pdo and loads .env
require __DIR__ . '/../includes/helpers.php';

$baseUrl     = rtrim($_ENV['APP_BASE_URL'] ?? 'https://utilities.aperkel.w3.uvm.edu', '/');
$fromAddress = $_ENV['APP_EMAIL_FROM_ADDRESS'] ?? '';
$fromName    = $_ENV['APP_EMAIL_FROM_NAME']    ?? '77 N Union Utilities';
$confirmTo   = $_ENV['APP_CONFIRMATION_EMAIL_TO'] ?? '';
$emailMap    = getEmailMap();

echo '========== Checking Bills ==========', PHP_EOL;
echo 'Started: ', date('Y-m-d H:i:s'), PHP_EOL;

// Fetch all unpaid bills with one row per person who owes
$rows = $pdo->query("
    SELECT
        u.pmkBillID  AS bill_id,
        u.fldDue     AS due_date,
        u.fldItem    AS item,
        u.fldTotal   AS total,
        u.fldCost    AS cost,
        p.personName AS person
    FROM tblUtilities u
    JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
    JOIN tblPeople   p  ON bo.personID = p.personID
    WHERE u.fldStatus <> 'Paid'
    ORDER BY u.fldDue, p.personName
")->fetchAll(PDO::FETCH_ASSOC);

if (empty($rows)) {
    echo 'No unpaid bills found.', PHP_EOL;
    echo 'Done: ', date('Y-m-d H:i:s'), PHP_EOL;
    exit(0);
}

echo 'Found ', count($rows), ' unpaid bill-person row(s).', PHP_EOL;

$sent   = [];
$failed = 0;
$today  = new DateTimeImmutable('today');

foreach ($rows as $row) {
    $due  = new DateTimeImmutable($row['due_date']);
    $diff = (int) $today->diff($due)->days;
    $days = $today <= $due ? $diff : -$diff;
    $name = $row['person'];
    $item = $row['item'];

    printf("- %s due %s for %s: %+d day(s)", $item, $row['due_date'], $name, $days);

    // Send at exactly 7 days out, and again at 3 days or fewer (including overdue)
    if ($days !== 7 && $days > 3) {
        echo ' — skip', PHP_EOL;
        continue;
    }

    $email = $emailMap[$name] ?? null;
    if (!$email) {
        echo " — no email found for {$name}", PHP_EOL;
        $failed++;
        continue;
    }

    $subject      = $days <= 3
        ? "URGENT: Reminder — {$item} Bill Due Soon"
        : "Reminder: {$item} Bill Due";
    $readableDate = $due->format('F j, Y');
    $total        = number_format((float) $row['total'], 2);
    $cost         = number_format((float) $row['cost'],  2);
    $portalUrl    = $baseUrl . '/index.php';

    $body = <<<HTML
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial;color:#0f1724;">
    <h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">Reminder: {$item}</h2>
    <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Hello {$name},</p>
    <p style="margin:0 0 8px 0;color:#374151;font-size:14px;">
        This is a reminder that your <strong>{$item}</strong> bill (total: \${$total}) is due on
        <strong>{$readableDate}</strong>. Your share: <strong>\${$cost}</strong>.
    </p>
    <p style="margin:0 0 12px 0;">
        <a href="{$portalUrl}" style="display:inline-block;padding:8px 12px;background:#3B82F6;color:#fff;border-radius:8px;text-decoration:none;">View details</a>
    </p>
    <hr style="border:none;border-top:1px solid #eef2ff;margin:12px 0;">
    <p style="margin:0;color:#6b7280;font-size:13px;">{$fromName} — <a href="mailto:{$fromAddress}">{$fromAddress}</a></p>
</div>
HTML;

    if (sendSmtpMail($email, $subject, $body)) {
        echo " — sent to {$email}", PHP_EOL;
        $sent[] = ['person' => $name, 'email' => $email, 'item' => $item];
    } else {
        echo " — FAILED", PHP_EOL;
        $failed++;
    }
    sleep(1);
}

echo '---------- Summary ----------', PHP_EOL;
printf("Sent: %d | Failed: %d%s", count($sent), $failed, PHP_EOL);

if ($sent && $confirmTo) {
    $rowsHtml = '';
    foreach ($sent as $r) {
        $rowsHtml .= "<tr>
            <td style='padding:6px 12px;border-bottom:1px solid #eef2ff;'>{$r['person']}</td>
            <td style='padding:6px 12px;border-bottom:1px solid #eef2ff;'>{$r['email']}</td>
            <td style='padding:6px 12px;border-bottom:1px solid #eef2ff;'>{$r['item']}</td>
        </tr>";
    }
    $count = count($sent);
    $confirmBody = <<<HTML
<div style="font-family:system-ui,Arial;color:#111827;">
    <h3 style="margin:0 0 12px 0;">Daily Reminder Batch ({$count} sent)</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Name</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Email</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Bill</th>
        </tr></thead>
        <tbody>{$rowsHtml}</tbody>
    </table>
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">{$fromName} — Automated Daily Script</p>
</div>
HTML;

    sendSmtpMail($confirmTo, "Daily Reminder Batch ({$count} sent)", $confirmBody);
    echo "Batch confirmation sent to {$confirmTo}", PHP_EOL;
}

echo 'Done: ', date('Y-m-d H:i:s'), PHP_EOL;
echo '====================================', PHP_EOL;

