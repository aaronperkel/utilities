<?php
// includes/helpers.php
// Shared utility functions used across multiple pages.

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailerException;

function sendSmtpMail(string $to, string $subject, string $body): bool
{
    $from     = $_ENV['APP_EMAIL_FROM_ADDRESS'] ?? '';
    $fromName = $_ENV['APP_EMAIL_FROM_NAME']    ?? '77 N Union Utilities';
    $pass     = $_ENV['EMAIL_PASS']             ?? '';
    $host     = $_ENV['SMTP_HOST']              ?? 'smtp.mail.me.com';
    $port     = (int) ($_ENV['SMTP_PORT']       ?? 587);

    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $host;
        $mail->SMTPAuth   = true;
        $mail->Username   = $from;
        $mail->Password   = $pass;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $port;
        $mail->setFrom($from, $fromName);
        $mail->addAddress($to);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $body;
        $mail->send();
        return true;
    } catch (MailerException) {
        error_log("PHPMailer failed sending to {$to}: " . $mail->ErrorInfo);
        return false;
    }
}

/**
 * Returns all bill types from the database.
 */
function getBillTypes(PDO $pdo): array
{
    return $pdo->query("SELECT typeID, typeName, typeEmoji, processingFee FROM tblBillTypes ORDER BY typeName")
               ->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Returns the processing fee for a given bill type name.
 */
function getBillTypeFee(PDO $pdo, string $typeName): float
{
    $stmt = $pdo->prepare("SELECT processingFee FROM tblBillTypes WHERE typeName = :name");
    $stmt->execute([':name' => $typeName]);
    return (float) ($stmt->fetchColumn() ?: 0);
}

/**
 * Returns an emoji for a bill item type (cached DB lookup with fallback).
 */
function billEmoji(string $item): string
{
    static $map = null;
    if ($map === null) {
        global $pdo;
        try {
            $map = $pdo->query("SELECT typeName, typeEmoji FROM tblBillTypes")
                       ->fetchAll(PDO::FETCH_KEY_PAIR);
        } catch (Exception $e) {
            $map = [];
        }
    }
    return $map[$item] ?? "\xF0\x9F\x93\x84";
}

/**
 * Gets the total count of all utility bills.
 */
function getTotalBillCount(PDO $pdo): int
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM tblUtilities');
    $stmt->execute();
    return (int) $stmt->fetchColumn();
}

/**
 * Fetches a page of utility bills ordered by date descending.
 */
function getBillsForPage(PDO $pdo, int $limit, int $offset): array
{
    $sql = '
        SELECT pmkBillID, fldDate, fldItem, fldTotal, fldCost, fldDue, fldStatus, fldView
        FROM tblUtilities
        ORDER BY fldDate DESC
        LIMIT :limit OFFSET :offset
    ';
    $stmt = $pdo->prepare($sql);
    $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Renders pagination HTML. Returns empty string if only one page.
 */
function paginationHtml(int $currentPage, int $totalPages, string $extraClass = ''): string
{
    if ($totalPages <= 1) return '';

    $start = max(1, $currentPage - 2);
    $end   = min($totalPages, $currentPage + 2);

    ob_start(); ?>
    <nav class="pagination <?= $extraClass ?>" role="navigation" aria-label="Pagination">
        <div class="pagination-info">Page <?= $currentPage ?> of <?= $totalPages ?></div>
        <div class="pagination-controls">
            <?php if ($currentPage > 1): ?>
                <a class="btn btn-outline" href="?page=<?= $currentPage - 1 ?>" aria-label="Previous page">&laquo; Prev</a>
            <?php else: ?>
                <span class="btn btn-outline disabled" aria-hidden="true">&laquo; Prev</span>
            <?php endif; ?>

            <?php if ($start > 1): ?>
                <a class="page" href="?page=1">1</a>
                <?php if ($start > 2): ?><span class="pagination-ellipsis">&hellip;</span><?php endif; ?>
            <?php endif; ?>

            <?php for ($i = $start; $i <= $end; $i++): ?>
                <a class="page <?= $i == $currentPage ? 'active' : '' ?>" href="?page=<?= $i ?>" <?= $i == $currentPage ? 'aria-current="page"' : '' ?>><?= $i ?></a>
            <?php endfor; ?>

            <?php if ($end < $totalPages): ?>
                <?php if ($end < $totalPages - 1): ?><span class="pagination-ellipsis">&hellip;</span><?php endif; ?>
                <a class="page" href="?page=<?= $totalPages ?>"><?= $totalPages ?></a>
            <?php endif; ?>

            <?php if ($currentPage < $totalPages): ?>
                <a class="btn btn-outline" href="?page=<?= $currentPage + 1 ?>" aria-label="Next page">Next &raquo;</a>
            <?php else: ?>
                <span class="btn btn-outline disabled" aria-hidden="true">Next &raquo;</span>
            <?php endif; ?>
        </div>
    </nav>
    <?php return ob_get_clean();
}
