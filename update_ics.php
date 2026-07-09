<?php
$sql = 'SELECT fldDue, fldStatus, fldItem FROM tblUtilities';
$stmt = $pdo->query($sql);

$EOL = "\r\n";
$dtstamp = gmdate('Ymd\THis\Z');
$ics  = "BEGIN:VCALENDAR{$EOL}VERSION:2.0{$EOL}PRODID:-//77 N Union Utilities//EN{$EOL}";
$ics .= "X-WR-CALNAME:77 N Union Utilities{$EOL}";

try {
    $rentRow = $pdo->query("SELECT rentAmount, startDate, endDate FROM tblRentConfig ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    $rentRow = null;
}
if ($rentRow && $rentRow['startDate'] && $rentRow['endDate']) {
    $rentStart = (new DateTime($rentRow['startDate']))->format('Ymd');
    $rentEnd   = (new DateTime($rentRow['endDate']))->format('Ymd');
    $ics .= "BEGIN:VEVENT{$EOL}UID:RentDueRecurring@77nunion{$EOL}DTSTAMP:{$dtstamp}{$EOL}";
    $ics .= "DTSTART;VALUE=DATE:{$rentStart}{$EOL}RRULE:FREQ=MONTHLY;UNTIL={$rentEnd};BYMONTHDAY=1{$EOL}";
    $ics .= "SUMMARY:\xF0\x9F\x8F\xA0 Rent Due{$EOL}END:VEVENT{$EOL}";
}

$emojiMap = [
    'Electric' => "\xE2\x9A\xA1",
    'Gas'      => "\xF0\x9F\x94\xA5",
    'Internet' => "\xF0\x9F\x8C\x90",
];

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $due = DateTime::createFromFormat('Y-m-d', $row['fldDue'])->format('Ymd');
    $paidFlag = strtolower($row['fldStatus']) === 'paid' ? ' - PAID' : '';
    $dtstamp = gmdate('Ymd\THis\Z');
    $emoji = $emojiMap[$row['fldItem']] ?? '';

    $ics .= "BEGIN:VEVENT{$EOL}";
    $ics .= "UID:{$row['fldItem']}-{$due}@77nunion{$EOL}";
    $ics .= "DTSTAMP:{$dtstamp}{$EOL}";
    $ics .= "DTSTART;VALUE=DATE:{$due}{$EOL}";
    $ics .= "DTEND;VALUE=DATE:{$due}{$EOL}";
    $ics .= "SUMMARY:{$emoji} {$row['fldItem']} Bill Due{$paidFlag}{$EOL}";
    $ics .= "END:VEVENT{$EOL}";
}

$ics .= "END:VCALENDAR{$EOL}";

$icsFilePath = __DIR__ . '/cal.ics';

if (file_put_contents($icsFilePath, $ics) === false) {
    error_log("Failed to write iCalendar file to: " . $icsFilePath . " - Check permissions and path.");
}
?>
