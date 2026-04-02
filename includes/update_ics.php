<?php
$sql = 'SELECT fldDue, fldStatus, fldItem FROM tblUtilities';
$stmt = $pdo->query($sql);

$EOL = "\r\n";
$dtstamp = gmdate('Ymd\THis\Z');
$ics = "BEGIN:VCALENDAR{$EOL}VERSION:2.0{$EOL}PRODID:-//81 Buell Utilities//EN{$EOL}";
$ics .= "BEGIN:VEVENT{$EOL}UID:RentDueRecurring@81buell{$EOL}DTSTAMP:{$dtstamp}{$EOL}";
$ics .= "DTSTART;VALUE=DATE:20240701{$EOL}RRULE:FREQ=MONTHLY;UNTIL=20260501;BYMONTHDAY=1{$EOL}";
$ics .= "SUMMARY:🏠 Rent Due{$EOL}END:VEVENT{$EOL}";

$emojiMap = [
    'Electric' => '💡',
    'Gas' => '🔥',
    'Internet' => '🌐',
];

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $due = DateTime::createFromFormat('Y-m-d', $row['fldDue'])->format('Ymd');
    $paidFlag = strtolower($row['fldStatus']) === 'paid' ? ' - PAID' : '';
    $dtstamp = gmdate('Ymd\THis\Z');
    $emoji = $emojiMap[$row['fldItem']] ?? '';

    $ics .= "BEGIN:VEVENT{$EOL}";
    $ics .= "UID:{$row['fldItem']}-{$due}@81buell{$EOL}";
    $ics .= "DTSTAMP:{$dtstamp}{$EOL}";
    $ics .= "DTSTART;VALUE=DATE:{$due}{$EOL}";
    $ics .= "DTEND;VALUE=DATE:{$due}{$EOL}";
    $ics .= "SUMMARY:{$emoji} {$row['fldItem']} Bill Due{$paidFlag}{$EOL}";
    $ics .= "END:VEVENT{$EOL}";
}

$ics .= "END:VCALENDAR{$EOL}"; // End iCalendar object.

// Same directory Apache (or php -S) uses as document root; see APP_WEB_ROOT in .env.
$icsFilePath = utilitiesPublicRoot() . DIRECTORY_SEPARATOR . 'cal.ics';

// Check if dry-run mode is active. The function isDryRunActive() is defined in connect-DB.php.
// The function_exists check is a safeguard.
if (function_exists('isDryRunActive') && isDryRunActive()) {
    // In dry-run mode, do not write the file.
    // The parent script (portal.php or update_owe.php) is responsible for
    // logging/messaging that this calendar update *would have* occurred.
    error_log("DRY RUN MODE: update_ics.php executed, but cal.ics file writing was skipped for path: " . $icsFilePath);
} else {
    // Live mode: proceed to write the file.
    // Ensure the target directory exists or attempt to create it (though less critical for a file in www-root).
    $icsFileDir = dirname($icsFilePath);
    if (!is_dir($icsFileDir)) {
        // Attempt to create the directory if it doesn't exist.
        // This might be needed if www-root itself is not guaranteed.
        if (!mkdir($icsFileDir, 0755, true) && !is_dir($icsFileDir)) { // Check !is_dir again in case of race condition
            error_log("Failed to create directory for ICS file: " . $icsFileDir);
            // Depending on severity, could die() or set an error message.
            // For now, just log and attempt file_put_contents which will likely fail.
        }
    }

    if (file_put_contents($icsFilePath, $ics) === false) {
        error_log("Failed to write iCalendar file to: " . $icsFilePath . " - Check permissions and path.");
    } else {
        // Optionally, log success if needed for debugging.
        // error_log("iCalendar file updated successfully at " . $icsFilePath);
    }
}
?>