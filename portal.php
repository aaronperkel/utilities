<?php
// portal.php
// Admin portal for managing utility bills: adding new bills, viewing existing ones, and managing payment statuses.

session_start(); // Start session for CSRF token management and flash messages.

include 'top.php'; // Includes header, navigation, and database connection (connect-DB.php).
requireAdmin();

// --- Configuration Loading ---
$appBaseUrl             = rtrim($_ENV['APP_BASE_URL'] ?? 'https://utilities.example.com', '/');
$emailMapArray          = getEmailMap();

$appEmailFromAddress = $_ENV['APP_EMAIL_FROM_ADDRESS'] ?? 'utilities@example.com'; // Email address for sending notifications.
$appEmailFromName = $_ENV['APP_EMAIL_FROM_NAME'] ?? '77 N Union Utilities'; // Sender name for emails.
$appConfirmationEmailTo = $_ENV['APP_CONFIRMATION_EMAIL_TO'] ?? 'admin@example.com'; // Admin email for confirmation messages.
$uploadBaseDir = __DIR__ . '/public/'; // Base directory for file uploads.

// Load bill types from DB for the dropdown and validation.
$billTypes = getBillTypes($pdo);
$allowedBillItems = array_column($billTypes, 'typeName');


// --- Function Definitions ---

/**
 * Sanitizes a string by trimming whitespace and converting special characters to HTML entities.
 * @param string $s The input string.
 * @return string The sanitized string.
 */
function sanitize(string $s): string
{
    return htmlspecialchars(trim($s), ENT_QUOTES);
}

/**
 * Validates the data submitted for a new bill.
 * @param array $postData Data from the $_POST superglobal.
 * @param array $filesData Data from the $_FILES superglobal.
 * @param array $allowedItemsList List of valid items for the 'item' field.
 * @return array An associative array containing 'data' (validated and processed values) and 'errors' (an array of error messages).
 */
function validateBillSubmissionData(array $postData, array $filesData, array $allowedItemsList): array
{
    $errors = [];
    $validatedData = [];

    // Extract and perform initial presence check for required fields.
    $validatedData['billDateStr'] = $postData['date'] ?? '';
    $validatedData['item'] = $postData['item'] ?? '';
    $validatedData['amountStr'] = $postData['amount'] ?? '';
    $validatedData['dueDateStr'] = $postData['due'] ?? '';

    if (empty($validatedData['billDateStr']) || empty($validatedData['item']) || empty($validatedData['amountStr']) ||
        empty($validatedData['dueDateStr']) || !isset($filesData['view']) || $filesData['view']['error'] === UPLOAD_ERR_NO_FILE) {
        $errors[] = "Missing one of: date, item, amount, due, or PDF.";
    }

    if (!in_array($validatedData['item'], $allowedItemsList, true)) {
        $errors[] = "Invalid item selected.";
    }

    if (!is_numeric($validatedData['amountStr'])) {
        $errors[] = "Amount must be numeric.";
    } else {
        $validatedData['amount'] = (float)$validatedData['amountStr'];
        if ($validatedData['amount'] <= 0) {
            $errors[] = "Amount must be a positive value.";
        }
    }

    $billDateTs = strtotime($validatedData['billDateStr']);
    $dueDateTs = strtotime($validatedData['dueDateStr']);
    if ($billDateTs === false) {
        $errors[] = "Invalid bill date format. Please use YYYY-MM-DD.";
    } else {
        $validatedData['billDate'] = date('Y-m-d', $billDateTs);
        $validatedData['year'] = date('Y', $billDateTs);
    }
    if ($dueDateTs === false) {
        $errors[] = "Invalid due date format. Please use YYYY-MM-DD.";
    } else {
        $validatedData['dueDate'] = date('Y-m-d', $dueDateTs);
    }


    // Validate presence of uploaded file. More detailed file validation (size, type) is in handleBillFileUpload.
    if (isset($filesData['view']) && $filesData['view']['error'] !== UPLOAD_ERR_OK && $filesData['view']['error'] !== UPLOAD_ERR_NO_FILE) {
        $errors[] = "File upload error code: " . $filesData['view']['error']; // Report existing upload errors.
    } elseif (!isset($filesData['view']) || $filesData['view']['error'] === UPLOAD_ERR_NO_FILE) {
        // This case is already covered by the initial presence check, but good for clarity.
        // $errors[] = "PDF file is required.";
    }

    return ['data' => $validatedData, 'errors' => $errors];
}

/**
 * Handles the file upload process for a bill's PDF.
 * Validates file size, type, sanitizes filename, creates upload directory, and moves the file.
 * @param array $fileInfo Entry from $_FILES superglobal (e.g., $_FILES['view']).
 * @param string $year Year derived from the bill date, used for structuring upload path.
 * @param string $itemValue Item name, used for structuring upload path.
 * @param string $baseUploadPath Base path for uploads (e.g., '/var/www/html/public/').
 * @return string The relative path to the uploaded file for database storage (e.g., 'public/2024/Gas/bill.pdf').
 * @throws RuntimeException If any validation or file operation fails.
 */
function handleBillFileUpload(array $fileInfo, string $year, string $itemValue, string $baseUploadPath): string
{
    // Check for upload errors reported by PHP.
    if ($fileInfo['error'] !== UPLOAD_ERR_OK) {
        throw new RuntimeException("Upload error code: " . $fileInfo['error']);
    }

    // Validate file size (e.g., 5MB limit).
    $maxFileSize = 5 * 1024 * 1024;
    if ($fileInfo['size'] > $maxFileSize) {
        throw new RuntimeException("File is too large. Maximum size is 5MB.");
    }
    if ($fileInfo['size'] === 0) {
        throw new RuntimeException("File is empty. Please upload a valid PDF.");
    }

    // Validate MIME type (server-side check).
    $allowedMimeTypes = ['application/pdf', 'application/x-pdf'];
    $fileMimeType = mime_content_type($fileInfo['tmp_name']); // More reliable than $_FILES['view']['type'].
    if (!in_array($fileMimeType, $allowedMimeTypes, true)) {
        throw new RuntimeException("Invalid file type. Only PDF files are allowed. Detected type: " . htmlspecialchars($fileMimeType));
    }

    // Sanitize filename.
    $origName = basename($fileInfo['name']); // Get filename component.
    $origName = preg_replace('/[^A-Za-z0-9.\-_]/', '', $origName); // Remove potentially harmful characters.
    if (empty($origName) || $origName === '.' || $origName === '..') {
        throw new RuntimeException("Invalid filename after sanitization. Please use standard characters.");
    }
    // Ensure filename ends with .pdf (case-insensitive).
    if (strtolower(substr($origName, -4)) !== '.pdf') {
        throw new RuntimeException("Filename must end with .pdf.");
    }

    // Construct and create item-specific upload directory if it doesn't exist.
    $uploadDir = $baseUploadPath . "{$year}/{$itemValue}/"; // e.g., '/var/www/html/public/2024/Gas/'
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) { // Create recursively with appropriate permissions.
        throw new RuntimeException("Failed to create upload directory: " . htmlspecialchars($uploadDir));
    }

    // Move the uploaded file to the destination.
    $destinationPath = $uploadDir . $origName;
    if (!move_uploaded_file($fileInfo['tmp_name'], $destinationPath)) {
        throw new RuntimeException("Failed to move uploaded file to " . htmlspecialchars($destinationPath));
    }
    // Return the relative path for database storage and linking.
    return "public/{$year}/{$itemValue}/{$origName}";
}

/**
 * Inserts a new bill record into the database.
 * @param PDO $dbConnection The PDO database connection object.
 * @param array $billDetails Associative array of validated bill data (item, total, cost, billDate, dueDate, year).
 * @param string $filePath Relative path to the uploaded PDF file.
 * @param string $filePath Relative path to the uploaded PDF file.
 * @return int|false The ID of the newly inserted bill on success, false on failure.
 */
function insertBillRecord(PDO $dbConnection, array $billDetails, string $filePath): int|false
{
    // fldOwe column is removed from tblUtilities
    $sql = "
        INSERT INTO tblUtilities
          (fldDate, fldItem, fldTotal, fldCost, fldDue, fldStatus, fldView)
        VALUES
          (:date, :item, :total, :cost, :due, 'Unpaid', :view) -- Default status is 'Unpaid'.
    ";
    $stmt = $dbConnection->prepare($sql);
    $success = $stmt->execute([
        ':date' => $billDetails['billDate'],
        ':item' => $billDetails['item'],
        ':total' => $billDetails['total'],
        ':cost' => $billDetails['cost'],
        ':due' => $billDetails['dueDate'],
        ':view' => sanitize($filePath),
    ]);
    if ($success) {
        return (int)$dbConnection->lastInsertId();
    }
    return false;
}

/**
 * Sends email notifications for a newly posted bill to relevant users and an admin confirmation.
 * @param array $billDetails Associative array of validated bill data.
 * @param string $dbPath Relative path to the uploaded PDF file, used for constructing links.
 * @param array $config Associative array of email configuration (emailMap, from details, admin email, base URL).
 */
function sendBillNotifications(array $billDetails, string $dbPath, array $config): void
{
    $subject = 'New Bill Posted: ' . htmlspecialchars($billDetails['item']);

    $billViewLink = $config['baseUrl'] . "/" . htmlspecialchars($dbPath);
    $portalLink = $config['baseUrl'] . "/index.php";

    $formattedDueDate = $billDetails['dueDate'];
    try {
        $dateObjForBody = new DateTime($billDetails['dueDate']);
        $formattedDueDate = $dateObjForBody->format("F j, Y");
    } catch (Exception $e) {
    }

    $emailedRecipientsForConfirmation = [];
    $peopleToNotify = $config['peopleToNotify'] ?? [];

    if (!empty($config['emailMap']) && !empty($peopleToNotify)) {
        foreach ($peopleToNotify as $person) {
            if (!is_array($person) || !isset($person['personName'])) {
                error_log("Invalid structure in peopleToNotify array for sendBillNotifications.");
                continue;
            }
            $personName = $person['personName'];
            if (isset($config['emailMap'][$personName])) {
                $toEmail = $config['emailMap'][$personName];

                $bodyHeader = "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial; color:#0f1724;\">";
                $bodyMain = "<h2 style=\"margin:0 0 8px 0; font-size:18px; color:#111827;\">New Bill: " . htmlspecialchars($billDetails['item']) . "</h2>";
                $bodyMain .= "<p style=\"margin:0 0 8px 0; color:#374151; font-size:14px;\">Hello " . htmlspecialchars($personName) . ",</p>";
                $bodyMain .= "<p style=\"margin:0 0 8px 0; color:#374151; font-size:14px;\">A new <strong>" . htmlspecialchars($billDetails['item']) . "</strong> bill has been posted.</p>";
                $bodyMain .= "<p style=\"margin:0 0 8px 0; color:#374151; font-size:14px;\"><strong>Total:</strong> $" . number_format($billDetails['total'], 2) . " &nbsp;|&nbsp; <strong>Your share:</strong> $" . number_format($billDetails['cost'], 2) . "</p>";
                $bodyMain .= "<p style=\"margin:0 0 12px 0; color:#374151; font-size:14px;\"><strong>Due:</strong> " . htmlspecialchars($formattedDueDate) . "</p>";
                $bodyMain .= "<p style=\"margin:0 0 12px 0;\"><a href=\"" . htmlspecialchars($billViewLink) . "\" style=\"display:inline-block;padding:8px 12px;background:#3B82F6;color:#fff;border-radius:8px;text-decoration:none;margin-right:8px;\">View Bill PDF</a> <a href=\"" . htmlspecialchars($portalLink) . "\" style=\"display:inline-block;padding:8px 12px;background:#e5e7eb;color:#374151;border-radius:8px;text-decoration:none;\">Go to Portal</a></p>";
                $bodyFooter = "<hr style=\"border:none;border-top:1px solid #eef2ff;margin:12px 0;\"><p style=\"margin:0;color:#6b7280;font-size:13px;\">" . htmlspecialchars($config['emailFromName']) . " — <a href=\"mailto:" . htmlspecialchars($config['emailFromAddress']) . "\">" . htmlspecialchars($config['emailFromAddress']) . "</a></p>";
                $body = $bodyHeader . $bodyMain . $bodyFooter . "</div>";

                if (sendSmtpMail($toEmail, $subject, $body)) {
                    $emailedRecipientsForConfirmation[$personName] = $toEmail;
                }
            } else {
                error_log("No email address found in email map for person: $personName");
            }
        }
    } else {
        error_log("Email map is empty. No bill notifications sent.");
    }

    if (!empty($config['confirmationEmailTo'])) {
        $confSubject = 'Admin Confirmation: New Bill Posted - ' . htmlspecialchars($billDetails['item']);
        $sentListStr = empty($emailedRecipientsForConfirmation)
            ? 'None (or all failed, check logs)'
            : implode(', ', array_map(fn($name, $email) => htmlspecialchars($name) . " &lt;" . htmlspecialchars($email) . "&gt;", array_keys($emailedRecipientsForConfirmation), array_values($emailedRecipientsForConfirmation)));

        $confBody = "<div style=\"font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;\">"
            . "<h3 style=\"margin:0 0 8px 0;\">Admin Confirmation: New Bill Posted</h3>"
            . "<p style=\"margin:6px 0 10px 0;color:#374151;\"><strong>Item:</strong> " . htmlspecialchars($billDetails['item']) . " &nbsp;|&nbsp; <strong>Total:</strong> $" . number_format($billDetails['total'], 2) . "</p>"
            . "<p style=\"margin:6px 0 10px 0;color:#374151;\"><strong>Due:</strong> " . htmlspecialchars($formattedDueDate) . "</p>"
            . "<p style=\"margin:6px 0 10px 0;color:#374151;\"><strong>Sent to:</strong> " . $sentListStr . "</p>"
            . "<hr style=\"border:none;border-top:1px solid #eef2ff;margin:12px 0;\">"
            . "<p style=\"margin:0;color:#6b7280;font-size:13px;\">Original Subject: " . htmlspecialchars($subject) . "</p>"
            . "</div>";
        sendSmtpMail($config['confirmationEmailTo'], $confSubject, $confBody);
    }
}

// getBillsForPage() is provided by includes/helpers.php

// getTotalBillCount() is provided by includes/helpers.php

/**
 * Calculates the total amount owed by each person for all unpaid bills.
 * @param PDO $dbConnection The PDO database connection object.
 * @return array An array where keys are person names and values are the total amount they owe.
 */
function getOwedAmounts(PDO $dbConnection): array
{
    $sql = "
        SELECT p.personName, SUM(u.fldCost) as totalOwed
        FROM tblBillOwes bo
        JOIN tblUtilities u ON bo.billID = u.pmkBillID
        JOIN tblPeople p ON bo.personID = p.personID
        WHERE u.fldStatus = 'Unpaid'
        GROUP BY p.personName
        HAVING totalOwed > 0
        ORDER BY p.personName
    ";
    $stmt = $dbConnection->prepare($sql);
    $stmt->execute();
    return $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
}

// billEmoji() and paginationHtml() are provided by includes/helpers.php

// Initialize arrays for holding error or success messages to be displayed to the user.
$error_messages = [];
$success_messages = [];

// Fetch all people for bill management forms.
try {
    $peopleStmt = $pdo->query("SELECT personID, personName FROM tblPeople ORDER BY personName ASC");
    $allPeople = $peopleStmt->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    error_log("Error fetching people: " . $e->getMessage());
    $allPeople = [];
    $error_messages[] = "Critical: Could not load user data from tblPeople.";
}

// Fetch full people details for the People management section.
$allPeopleDetails = [];
try {
    $allPeopleDetails = $pdo->query(
        "SELECT personID, personName, uid, email, is_admin FROM tblPeople ORDER BY personName ASC"
    )->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    error_log("Could not fetch people details: " . $e->getMessage());
}

// --- POST: Person Management ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['person_action'])) {
    if (!isset($_POST['csrf_token'], $_SESSION['csrf_token_list_forms'])
        || !hash_equals($_SESSION['csrf_token_list_forms'], $_POST['csrf_token'])) {
        $error_messages[] = "CSRF validation failed.";
    } else {
        $personAction = $_POST['person_action'];

        if ($personAction === 'add' || $personAction === 'edit') {
            $pName  = trim($_POST['person_name']  ?? '');
            $pUid   = trim($_POST['person_uid']   ?? '');
            $pEmail = trim($_POST['person_email'] ?? '');
            $pAdmin = isset($_POST['person_is_admin']) ? 1 : 0;

            if (empty($pName) || empty($pUid) || empty($pEmail)) {
                $error_messages[] = "Name, NetID, and email are all required.";
            } elseif (!filter_var($pEmail, FILTER_VALIDATE_EMAIL)) {
                $error_messages[] = "Invalid email address.";
            } else {
                try {
                    if ($personAction === 'add') {
                        $pdo->prepare(
                            "INSERT INTO tblPeople (personName, uid, email, is_admin) VALUES (:name, :uid, :email, :admin)"
                        )->execute([':name' => $pName, ':uid' => $pUid, ':email' => $pEmail, ':admin' => $pAdmin]);
                        $_SESSION['success_message'] = "User '{$pName}' added.";
                    } else {
                        $pId = (int) ($_POST['person_id'] ?? 0);
                        if (!$pId) { $error_messages[] = "Invalid user ID."; }
                        else {
                            $pdo->prepare(
                                "UPDATE tblPeople SET personName=:name, uid=:uid, email=:email, is_admin=:admin WHERE personID=:id"
                            )->execute([':name' => $pName, ':uid' => $pUid, ':email' => $pEmail, ':admin' => $pAdmin, ':id' => $pId]);
                            $_SESSION['success_message'] = "User '{$pName}' updated.";
                        }
                    }
                    if (empty($error_messages)) { header('Location: portal.php'); exit; }
                } catch (PDOException $e) {
                    $isDuplicate = stripos($e->getMessage(), 'Duplicate') !== false;
                    $error_messages[] = $isDuplicate ? "That NetID is already in use." : "Database error: " . htmlspecialchars($e->getMessage());
                }
            }

        } elseif ($personAction === 'remove') {
            $pId = (int) ($_POST['person_id'] ?? 0);
            if (!$pId) {
                $error_messages[] = "Invalid user ID.";
            } else {
                try {
                    $pdo->prepare("DELETE FROM tblPeople WHERE personID = :id")->execute([':id' => $pId]);
                    $_SESSION['success_message'] = "User removed.";
                    header('Location: portal.php'); exit;
                } catch (PDOException $e) {
                    $error_messages[] = "Failed to remove user: " . htmlspecialchars($e->getMessage());
                }
            }
        }
    }
}

// --- POST: Bill Type Management ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['billtype_action'])) {
    if (!isset($_POST['csrf_token'], $_SESSION['csrf_token_list_forms'])
        || !hash_equals($_SESSION['csrf_token_list_forms'], $_POST['csrf_token'])) {
        $error_messages[] = "CSRF validation failed.";
    } else {
        $btAction = $_POST['billtype_action'];

        if ($btAction === 'add' || $btAction === 'edit') {
            $btName  = trim($_POST['billtype_name']  ?? '');
            $btEmoji = trim($_POST['billtype_emoji'] ?? '');
            $btFee   = $_POST['billtype_fee'] ?? '0';

            if (empty($btName) || empty($btEmoji)) {
                $error_messages[] = "Name and emoji are required.";
            } elseif (!is_numeric($btFee) || (float)$btFee < 0) {
                $error_messages[] = "Processing fee must be zero or a positive number.";
            } else {
                $btFee = (float)$btFee;
                try {
                    if ($btAction === 'add') {
                        $pdo->prepare(
                            "INSERT INTO tblBillTypes (typeName, typeEmoji, processingFee) VALUES (:name, :emoji, :fee)"
                        )->execute([':name' => $btName, ':emoji' => $btEmoji, ':fee' => $btFee]);
                        $_SESSION['success_message'] = "Bill type '{$btName}' added.";
                    } else {
                        $btId = (int)($_POST['billtype_id'] ?? 0);
                        if (!$btId) { $error_messages[] = "Invalid bill type ID."; }
                        else {
                            $pdo->prepare(
                                "UPDATE tblBillTypes SET typeName=:name, typeEmoji=:emoji, processingFee=:fee WHERE typeID=:id"
                            )->execute([':name' => $btName, ':emoji' => $btEmoji, ':fee' => $btFee, ':id' => $btId]);
                            $_SESSION['success_message'] = "Bill type '{$btName}' updated.";
                        }
                    }
                    if (empty($error_messages)) { header('Location: portal.php'); exit; }
                } catch (PDOException $e) {
                    $isDup = stripos($e->getMessage(), 'Duplicate') !== false;
                    $error_messages[] = $isDup ? "A bill type with that name already exists." : "Database error: " . htmlspecialchars($e->getMessage());
                }
            }

        } elseif ($btAction === 'remove') {
            $btId = (int)($_POST['billtype_id'] ?? 0);
            if (!$btId) {
                $error_messages[] = "Invalid bill type ID.";
            } else {
                $nameStmt = $pdo->prepare("SELECT typeName FROM tblBillTypes WHERE typeID = :id");
                $nameStmt->execute([':id' => $btId]);
                $btName = $nameStmt->fetchColumn();
                if (!$btName) {
                    $error_messages[] = "Bill type not found.";
                } else {
                    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM tblUtilities WHERE fldItem = :name");
                    $countStmt->execute([':name' => $btName]);
                    if ((int)$countStmt->fetchColumn() > 0) {
                        $error_messages[] = "Cannot remove '{$btName}' — there are existing bills of this type.";
                    } else {
                        $pdo->prepare("DELETE FROM tblBillTypes WHERE typeID = :id")->execute([':id' => $btId]);
                        $_SESSION['success_message'] = "Bill type '{$btName}' removed.";
                        header('Location: portal.php'); exit;
                    }
                }
            }
        }
    }
    // Refresh bill types after changes
    $billTypes = getBillTypes($pdo);
    $allowedBillItems = array_column($billTypes, 'typeName');
}

// --- POST: Rent Configuration ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['rent_action'])) {
    if (!isset($_POST['csrf_token'], $_SESSION['csrf_token_list_forms'])
        || !hash_equals($_SESSION['csrf_token_list_forms'], $_POST['csrf_token'])) {
        $error_messages[] = "CSRF validation failed.";
    } else {
        $rentAmount = $_POST['rent_amount'] ?? '';
        $rentStart  = $_POST['rent_start']  ?? '';
        $rentEnd    = $_POST['rent_end']    ?? '';

        if (!is_numeric($rentAmount) || (float)$rentAmount <= 0) {
            $error_messages[] = "Rent amount must be a positive number.";
        } elseif (!$rentStart || !$rentEnd || strtotime($rentStart) === false || strtotime($rentEnd) === false) {
            $error_messages[] = "Valid start and end dates are required.";
        } elseif (strtotime($rentEnd) <= strtotime($rentStart)) {
            $error_messages[] = "End date must be after start date.";
        } else {
            $rentAmount = (float)$rentAmount;
            $rentStart  = date('Y-m-d', strtotime($rentStart));
            $rentEnd    = date('Y-m-d', strtotime($rentEnd));

            $existing = $pdo->query("SELECT id FROM tblRentConfig LIMIT 1")->fetch();
            if ($existing) {
                $pdo->prepare("UPDATE tblRentConfig SET rentAmount = :amt, startDate = :start, endDate = :end WHERE id = :id")
                    ->execute([':amt' => $rentAmount, ':start' => $rentStart, ':end' => $rentEnd, ':id' => $existing['id']]);
            } else {
                $pdo->prepare("INSERT INTO tblRentConfig (rentAmount, startDate, endDate) VALUES (:amt, :start, :end)")
                    ->execute([':amt' => $rentAmount, ':start' => $rentStart, ':end' => $rentEnd]);
            }

            include 'update_ics.php';
            $_SESSION['success_message'] = "Rent configuration updated.";
            header('Location: portal.php'); exit;
        }
    }
}

// --- POST Request Handling (Adding a new bill) ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !isset($_POST['person_action']) && !isset($_POST['billtype_action']) && !isset($_POST['rent_action'])) {
    // Verify CSRF token.
    if (!isset($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token_main_form'], $_POST['csrf_token'])) {
        $error_messages[] = "CSRF token validation failed. Please try submitting the form again.";
    } else {
        // Regenerate CSRF token after successful validation.
        $_SESSION['csrf_token_main_form'] = bin2hex(random_bytes(32));

        // Validate submitted form data.
        $validationResult = validateBillSubmissionData($_POST, $_FILES, $allowedBillItems);

        if (!empty($validationResult['errors'])) {
            $error_messages = array_merge($error_messages, $validationResult['errors']);
        } else {
            $validatedPostData = $validationResult['data'];

            // Compute total (amount + processing fee) and per-person cost
            $fee = getBillTypeFee($pdo, $validatedPostData['item']);
            $validatedPostData['total'] = $validatedPostData['amount'] + $fee;
            $peopleCount = count($allPeople);
            $validatedPostData['cost'] = $peopleCount > 0
                ? round($validatedPostData['total'] / $peopleCount, 2)
                : 0;

            $dbPath = null;
            try {
                $dbPath = handleBillFileUpload(
                    $_FILES['view'],
                    $validatedPostData['year'],
                    $validatedPostData['item'],
                    $uploadBaseDir
                );

                $newBillId = insertBillRecord($pdo, $validatedPostData, $dbPath);

                if (!$newBillId) {
                    $error_messages[] = "Failed to insert bill into database. Please check logs or contact support.";
                } else {
                    if (!empty($allPeople)) {
                        $stmtInsertOwes = $pdo->prepare("INSERT INTO tblBillOwes (billID, personID) VALUES (:billID, :personID)");
                        foreach ($allPeople as $person) {
                            if (is_array($person) && isset($person['personID'])) {
                                $stmtInsertOwes->execute([':billID' => $newBillId, ':personID' => $person['personID']]);
                            } else {
                                error_log("Invalid person data structure for tblBillOwes insertion: " . print_r($person, true));
                            }
                        }
                    } else {
                        error_log("No people found in \$allPeople to populate tblBillOwes for new bill ID: $newBillId");
                    }

                    include 'update_ics.php';

                    $peopleForNotification = [];
                    if (!empty($allPeople)) {
                        foreach($allPeople as $p) {
                            if (isset($p['personName'])) {
                               $peopleForNotification[] = ['personName' => $p['personName']];
                            }
                        }
                    }

                    $notificationConfig = [
                        'emailMap' => $emailMapArray,
                        'peopleToNotify' => $peopleForNotification,
                        'emailFromName' => $appEmailFromName,
                        'emailFromAddress' => $appEmailFromAddress,
                        'confirmationEmailTo' => $appConfirmationEmailTo,
                        'baseUrl' => $appBaseUrl
                    ];
                    sendBillNotifications($validatedPostData, $dbPath, $notificationConfig);

                    $_SESSION['success_message'] = "New bill successfully added and assigned to all users!";
                    header('Location: portal.php');
                    exit;
                }
            } catch (RuntimeException $e) {
                $error_messages[] = "File handling error: " . htmlspecialchars($e->getMessage());
            } catch (Exception $e) {
                error_log("General error during POST processing: " . $e->getMessage());
                $error_messages[] = "An unexpected error occurred. Please try again or contact support if the issue persists.";
            }
        }
    }
}

// After POST processing or on a GET request, check for flash success messages from session.
if (isset($_SESSION['success_message'])) {
    $success_messages[] = $_SESSION['success_message'];
    unset($_SESSION['success_message']);
}

// --- GET Request Handling (Displaying bills and forms) ---
// $allPeople is already fetched above.

// Pagination setup for admin view
$billsPerPage = (int)($_ENV['APP_BILLS_PER_PAGE'] ?? 10); // Number of bills per page from .env or default.
$currentPage = isset($_GET['page']) ? (int)$_GET['page'] : 1; // Get current page from URL, default to 1.
if ($currentPage < 1) { // Ensure current page is at least 1.
    $currentPage = 1;
}
$offset = ($currentPage - 1) * $billsPerPage; // Calculate database offset.

$totalBills = getTotalBillCount($pdo); // Get total number of bills.
$totalPages = $totalBills > 0 ? ceil($totalBills / $billsPerPage) : 1; // Calculate total pages, ensure at least 1.

// If current page is beyond the total number of pages (and there are bills), redirect to the last valid page.
if ($currentPage > $totalPages && $totalBills > 0) {
    header('Location: portal.php?page=' . $totalPages);
    exit;
}

// Fetch bills for the current page.
$cells = getBillsForPage($pdo, $billsPerPage, $offset);

// Get the amounts owed by each person.
$owedAmounts = getOwedAmounts($pdo);

// Fetch current rent configuration
try {
    $rentConfig = $pdo->query("SELECT rentAmount, startDate, endDate FROM tblRentConfig ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    $rentConfig = null;
}

// Generate a CSRF token for forms within the bills list (e.g., send reminder, update owe).
if (empty($_SESSION['csrf_token_list_forms'])) {
    $_SESSION['csrf_token_list_forms'] = bin2hex(random_bytes(32));
}
$csrfTokenListForms = $_SESSION['csrf_token_list_forms'];
?>
<main class="admin-area">

    <h2 class="section-title">Admin Portal</h2>

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

    <?php if (!empty($success_messages)): ?>
        <div class="messages success-messages">
            <ul>
                <?php foreach ($success_messages as $msg): ?>
                    <li><?= htmlspecialchars($msg) ?></li>
                <?php endforeach; ?>
            </ul>
        </div>
    <?php endif; ?>

    <?php if (!empty($owedAmounts)): ?>
    <div class="insight-card mb-md">
        <h3>Who Owes What</h3>
        <ul>
            <?php foreach ($owedAmounts as $name => $amount): ?>
                <li>
                    <span class="cell-strong"><?= htmlspecialchars($name) ?></span>
                    <strong class="owes-amount">$<?= number_format((float)$amount, 2) ?></strong>
                </li>
            <?php endforeach; ?>
        </ul>
    </div>
    <?php endif; ?>

    <section class="add-bill-section">
    <h2 class="section-title">Add New Bill</h2>
    <div class="form-panel mb-lg">
        <form id="add-bill-form" method="POST" action="portal.php" enctype="multipart/form-data" data-people-count="<?= count($allPeople) ?>">
            <?php
            if (empty($_SESSION['csrf_token_main_form'])) {
                $_SESSION['csrf_token_main_form'] = bin2hex(random_bytes(32));
            }
            $csrfTokenMainForm = $_SESSION['csrf_token_main_form'];
            ?>
            <input type="hidden" name="csrf_token" value="<?= $csrfTokenMainForm ?>">
            <div class="form-row">
                <div class="form-group">
                    <label for="item">Type</label>
                    <select id="item" name="item" required>
                        <option value="" disabled selected>Select...</option>
                        <?php foreach ($billTypes as $bt): ?>
                            <option value="<?= htmlspecialchars($bt['typeName']) ?>"
                                    data-fee="<?= htmlspecialchars($bt['processingFee']) ?>">
                                <?= htmlspecialchars($bt['typeEmoji']) ?> <?= htmlspecialchars($bt['typeName']) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label for="date">Bill Date</label>
                    <input type="date" id="date" name="date" required>
                </div>
                <div class="form-group">
                    <label for="due">Due Date</label>
                    <input type="date" id="due" name="due" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="amount">Bill Amount</label>
                    <div class="input-prefix">
                        <span class="prefix">$</span>
                        <input type="number" id="amount" name="amount" step="0.01" placeholder="0.00" required>
                    </div>
                </div>
                <div class="form-group">
                    <label>Total <small id="fee-hint" class="muted"></small></label>
                    <div class="input-prefix">
                        <span class="prefix">$</span>
                        <input type="number" id="total-display" step="0.01" placeholder="0.00" readonly>
                    </div>
                </div>
                <div class="form-group">
                    <label>Per Person</label>
                    <div class="input-prefix">
                        <span class="prefix">$</span>
                        <input type="number" id="cost-display" step="0.01" placeholder="0.00" readonly>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="view">PDF Statement</label>
                    <input type="file" id="view" name="view" accept="application/pdf" required>
                    <small class="form-hint">Max 5MB</small>
                </div>
            </div>
            <div>
                <button type="submit" class="btn btn-primary" aria-label="Submit new bill">Submit New Bill</button>
            </div>
        </form>
    </div>
    </section>

    <h2 class="section-title">Bills</h2>
    <div id="admin-bills-container">
    <div class="table-responsive">
        <table>
            <thead>
                <tr>
                    <th>Bill</th>
                    <th>Amount</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Paid By</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($cells)): ?>
                    <tr><td colspan="6">No bills found for this page.</td></tr>
                <?php else: ?>
                    <?php foreach ($cells as $c): ?>
                        <?php
                            $bDate = (new DateTime($c['fldDate']))->format('M j, Y');
                        ?>
                        <tr class="bill-row" data-bill-id="<?= htmlspecialchars($c['pmkBillID']) ?>" data-due="<?= htmlspecialchars($c['fldDue']) ?>" data-status="<?= strtolower($c['fldStatus']) ?>">
                            <td class="item-cell">
                                <div class="item-name"><?= billEmoji($c['fldItem']) ?> <?= htmlspecialchars($c['fldItem']) ?></div>
                                <div class="item-date"><?= htmlspecialchars($bDate) ?></div>
                            </td>
                            <td class="price-cell">
                                <div class="price-main">$<?= number_format((float)$c['fldTotal'], 2) ?></div>
                                <div class="price-sub">$<?= number_format((float)$c['fldCost'], 2) ?> / person</div>
                            </td>
                            <td class="due-cell">
                                <span class="due-chip" data-due="<?= htmlspecialchars($c['fldDue']) ?>" data-paid="<?= $c['fldStatus'] === 'Paid' ? '1' : '0' ?>"></span>
                            </td>
                            <td class="status-cell">
                                <span class="badge <?= strtolower($c['fldStatus']) === 'paid' ? 'badge-paid' : 'badge-unpaid' ?>"><?= htmlspecialchars($c['fldStatus']) ?></span>
                            </td>
                            <td class="payment-cell">
                                <form method="POST" action="update_owe.php" class="payment-form payment-form-auto" data-bill-id="<?= $c['pmkBillID'] ?>">
                                    <input type="hidden" name="billID" value="<?= $c['pmkBillID'] ?>">
                                    <input type="hidden" name="csrf_token" value="<?= $csrfTokenListForms ?>">
                                    <div class="checkbox-grid">
                                    <?php
                                    if (!empty($allPeople)) {
                                        $owesStmt = $pdo->prepare("SELECT personID FROM tblBillOwes WHERE billID = :billID");
                                        $owesStmt->execute([':billID' => $c['pmkBillID']]);
                                        $peopleOwingThisBillIDs = $owesStmt->fetchAll(PDO::FETCH_COLUMN);
                                        foreach ($allPeople as $person):
                                            $hasEffectivelyPaid = ($c['fldStatus'] === 'Paid') || !in_array($person['personID'], $peopleOwingThisBillIDs);
                                    ?>
                                            <label class="checkbox-inline">
                                                <input type="checkbox" name="paidPersonIDs[]" value="<?= $person['personID'] ?>" <?= $hasEffectivelyPaid ? 'checked' : '' ?>>
                                                <span><?= htmlspecialchars($person['personName']) ?></span>
                                            </label>
                                    <?php
                                        endforeach;
                                    } else {
                                        echo "N/A";
                                    }
                                    ?>
                                    </div>
                                </form>
                            </td>
                            <td class="actions-cell">
                                <div class="action-btns">
                                    <a href="<?= htmlspecialchars($c['fldView']) ?>" target="_blank" class="btn-icon btn-sm" title="View bill" aria-label="View bill <?= htmlspecialchars($c['pmkBillID']) ?>"><i class="fa fa-eye" aria-hidden="true"></i></a>
                                    <a href="<?= htmlspecialchars($c['fldView']) ?>" download class="btn-icon btn-sm" title="Download bill" aria-label="Download bill <?= htmlspecialchars($c['pmkBillID']) ?>"><i class="fa fa-download" aria-hidden="true"></i></a>
                                    <?php if ($c['fldStatus'] !== 'Paid'): ?>
                                        <form method="POST" action="send_reminder.php" class="reminder-form">
                                            <input type="hidden" name="csrf_token" value="<?= $csrfTokenListForms ?>">
                                            <input type="hidden" name="sendReminder" value="1">
                                            <input type="hidden" name="pmk" value="<?= htmlspecialchars((string)$c['pmkBillID']) ?>">
                                            <button type="submit" class="btn-icon btn-sm" title="Send reminder email" aria-label="Send reminder"><i class="fa fa-envelope" aria-hidden="true"></i></button>
                                        </form>
                                    <?php endif; ?>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
    </div><!-- #admin-bills-container -->

    <?= paginationHtml($currentPage, $totalPages) ?>

    <div class="section-header">
        <h2 class="section-title">Manage Bill Types</h2>
        <button type="button" class="btn btn-primary btn-sm" onclick="openBillTypeModal('add')">+ Add Type</button>
    </div>
    <div class="form-panel panel-flush mb-lg">
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Emoji</th>
                        <th>Processing Fee</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($billTypes as $bt): ?>
                        <tr>
                            <td class="cell-strong" data-label="Name"><?= htmlspecialchars($bt['typeName']) ?></td>
                            <td data-label="Emoji"><?= htmlspecialchars($bt['typeEmoji']) ?></td>
                            <td class="muted" data-label="Fee">$<?= number_format((float)$bt['processingFee'], 2) ?></td>
                            <td data-label="Actions">
                                <div class="action-btns">
                                    <button type="button" class="btn btn-outline btn-sm"
                                        onclick="openBillTypeModal('edit',{id:'<?= $bt['typeID'] ?>',name:'<?= htmlspecialchars($bt['typeName'], ENT_QUOTES) ?>',emoji:'<?= htmlspecialchars($bt['typeEmoji'], ENT_QUOTES) ?>',fee:'<?= htmlspecialchars($bt['processingFee'], ENT_QUOTES) ?>'})">Edit</button>
                                    <form method="POST" action="portal.php" class="inline-form"
                                          onsubmit="return confirm('Remove <?= htmlspecialchars($bt['typeName'], ENT_QUOTES) ?>?')">
                                        <input type="hidden" name="csrf_token" value="<?= $csrfTokenListForms ?>">
                                        <input type="hidden" name="billtype_action" value="remove">
                                        <input type="hidden" name="billtype_id" value="<?= (int)$bt['typeID'] ?>">
                                        <button type="submit" class="btn btn-outline btn-sm">Remove</button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if (empty($billTypes)): ?>
                        <tr><td colspan="4" class="muted">No bill types configured.</td></tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

    <h2 class="section-title">Rent Configuration</h2>
    <div class="form-panel mb-lg">
        <form method="POST" action="portal.php">
            <input type="hidden" name="csrf_token" value="<?= $csrfTokenListForms ?>">
            <input type="hidden" name="rent_action" value="save">
            <div class="form-row">
                <div class="form-group">
                    <label for="rent_amount">Monthly Rent</label>
                    <div class="input-prefix">
                        <span class="prefix">$</span>
                        <input type="number" id="rent_amount" name="rent_amount" step="0.01" min="0"
                               value="<?= htmlspecialchars($rentConfig['rentAmount'] ?? '') ?>" placeholder="0.00" required>
                    </div>
                </div>
                <div class="form-group">
                    <label for="rent_start">Lease Start</label>
                    <input type="date" id="rent_start" name="rent_start"
                           value="<?= htmlspecialchars($rentConfig['startDate'] ?? '') ?>" required>
                </div>
                <div class="form-group">
                    <label for="rent_end">Lease End</label>
                    <input type="date" id="rent_end" name="rent_end"
                           value="<?= htmlspecialchars($rentConfig['endDate'] ?? '') ?>" required>
                </div>
            </div>
            <div>
                <button type="submit" class="btn btn-primary">Save Rent Config</button>
                <?php if ($rentConfig): ?>
                    <span class="muted inline-note">
                        Current: $<?= number_format((float)$rentConfig['rentAmount'], 2) ?>/mo
                        (<?= (new DateTime($rentConfig['startDate']))->format('M Y') ?> – <?= (new DateTime($rentConfig['endDate']))->format('M Y') ?>)
                    </span>
                <?php endif; ?>
            </div>
        </form>
    </div>

    <div class="section-header">
        <h2 class="section-title">Manage Users</h2>
        <button type="button" class="btn btn-primary btn-sm" onclick="openUserModal('add')">+ Add User</button>
    </div>
    <div class="form-panel panel-flush">
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>NetID</th>
                        <th>Email</th>
                        <th>Admin</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($allPeopleDetails as $p): ?>
                        <tr>
                            <td class="cell-strong" data-label="Name"><?= htmlspecialchars($p['personName']) ?></td>
                            <td class="muted" data-label="NetID"><?= htmlspecialchars($p['uid'] ?? '') ?></td>
                            <td class="muted" data-label="Email"><?= htmlspecialchars($p['email'] ?? '') ?></td>
                            <td data-label="Admin"><?= $p['is_admin'] ? '<span class="badge badge-paid">Admin</span>' : '<span class="muted">—</span>' ?></td>
                            <td data-label="Actions">
                                <div class="action-btns">
                                    <button type="button" class="btn btn-outline btn-sm"
                                        onclick="openUserModal('edit',{id:'<?= $p['personID'] ?>',name:'<?= htmlspecialchars($p['personName'], ENT_QUOTES) ?>',uid:'<?= htmlspecialchars($p['uid'] ?? '', ENT_QUOTES) ?>',email:'<?= htmlspecialchars($p['email'] ?? '', ENT_QUOTES) ?>',admin:'<?= $p['is_admin'] ? '1' : '0' ?>'})">Edit</button>
                                    <form method="POST" action="portal.php" class="inline-form"
                                          onsubmit="return confirm('Remove <?= htmlspecialchars($p['personName'], ENT_QUOTES) ?>?')">
                                        <input type="hidden" name="csrf_token" value="<?= $csrfTokenListForms ?>">
                                        <input type="hidden" name="person_action" value="remove">
                                        <input type="hidden" name="person_id" value="<?= (int)$p['personID'] ?>">
                                        <button type="submit" class="btn btn-outline btn-sm">Remove</button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if (empty($allPeopleDetails)): ?>
                        <tr><td colspan="5" class="muted">No users found.</td></tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- User add/edit modal -->
    <div id="user-modal" style="display:none" onclick="if(event.target===this)closeUserModal()">
        <div class="modal-box">
            <h3 id="modal-title"></h3>
            <form method="POST" action="portal.php">
                <input type="hidden" name="csrf_token" value="<?= $csrfTokenListForms ?>">
                <input type="hidden" name="person_action" id="modal-action" value="add">
                <input type="hidden" name="person_id" id="modal-person-id">
                <div class="form-row">
                    <div class="form-group">
                        <label for="modal-name">Name</label>
                        <input type="text" id="modal-name" name="person_name" required>
                    </div>
                    <div class="form-group">
                        <label for="modal-uid">UVM NetID</label>
                        <input type="text" id="modal-uid" name="person_uid" required>
                    </div>
                </div>
                <div class="form-group">
                    <label for="modal-email">Email</label>
                    <input type="email" id="modal-email" name="person_email" required>
                </div>
                <label class="checkbox-inline field-checkbox">
                    <input type="checkbox" id="modal-admin" name="person_is_admin" value="1">
                    <span>Admin access</span>
                </label>
                <div class="modal-actions">
                    <button type="submit" class="btn btn-primary">Save</button>
                    <button type="button" class="btn btn-outline" onclick="closeUserModal()">Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Bill type add/edit modal -->
    <div id="billtype-modal" style="display:none" onclick="if(event.target===this)closeBillTypeModal()">
        <div class="modal-box">
            <h3 id="bt-modal-title"></h3>
            <form method="POST" action="portal.php">
                <input type="hidden" name="csrf_token" value="<?= $csrfTokenListForms ?>">
                <input type="hidden" name="billtype_action" id="bt-modal-action" value="add">
                <input type="hidden" name="billtype_id" id="bt-modal-id">
                <div class="form-row">
                    <div class="form-group">
                        <label for="bt-modal-name">Name</label>
                        <input type="text" id="bt-modal-name" name="billtype_name" placeholder="e.g. Water" required>
                    </div>
                    <div class="form-group">
                        <label for="bt-modal-emoji">Emoji</label>
                        <input type="text" id="bt-modal-emoji" name="billtype_emoji" placeholder="e.g. 💧" required>
                    </div>
                </div>
                <div class="form-group">
                    <label for="bt-modal-fee">Processing Fee</label>
                    <div class="input-prefix">
                        <span class="prefix">$</span>
                        <input type="number" id="bt-modal-fee" name="billtype_fee" step="0.01" value="0.00" min="0" required>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="submit" class="btn btn-primary">Save</button>
                    <button type="button" class="btn btn-outline" onclick="closeBillTypeModal()">Cancel</button>
                </div>
            </form>
        </div>
    </div>

</main>

<script>
function openUserModal(mode, data) {
    data = data || {};
    document.getElementById('modal-action').value = mode;
    document.getElementById('modal-person-id').value = data.id || '';
    document.getElementById('modal-name').value = data.name || '';
    document.getElementById('modal-uid').value = data.uid || '';
    document.getElementById('modal-email').value = data.email || '';
    document.getElementById('modal-admin').checked = data.admin === '1';
    document.getElementById('modal-title').textContent = mode === 'edit' ? 'Edit User' : 'Add User';
    document.getElementById('user-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('modal-name').focus(), 50);
}
function closeUserModal() {
    document.getElementById('user-modal').style.display = 'none';
}

function openBillTypeModal(mode, data) {
    data = data || {};
    document.getElementById('bt-modal-action').value = mode;
    document.getElementById('bt-modal-id').value = data.id || '';
    document.getElementById('bt-modal-name').value = data.name || '';
    document.getElementById('bt-modal-emoji').value = data.emoji || '';
    document.getElementById('bt-modal-fee').value = data.fee || '0.00';
    document.getElementById('bt-modal-title').textContent = mode === 'edit' ? 'Edit Bill Type' : 'Add Bill Type';
    document.getElementById('billtype-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('bt-modal-name').focus(), 50);
}
function closeBillTypeModal() {
    document.getElementById('billtype-modal').style.display = 'none';
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeUserModal(); closeBillTypeModal(); }
});
</script>

<?php include 'footer.php'; ?>

