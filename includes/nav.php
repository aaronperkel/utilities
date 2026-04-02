<!-- nav.php -->
<!-- Navigation bar for the site. Uses $pathParts from top.php to highlight the active page. -->
<header class="site-header card">
    <div class="site-brand">
        <h1>81 Buell</h1>
        <p class="site-tag">Utilities Dashboard</p>
    </div>
    <nav class="main-nav" role="navigation" aria-label="Main navigation">
        <a href="./" class="<?= ($pathParts['filename'] == 'index') ? 'activePage nav-link' : 'nav-link' ?>">Home</a>
        <a href="./trends.php" class="<?= ($pathParts['filename'] == 'trends') ? 'activePage nav-link' : 'nav-link' ?>">Trends</a>
        <?php
        if (($_SERVER['REMOTE_USER'] ?? '') === 'aperkel'):
        ?>
            <a href="./portal.php" class="<?= ($pathParts['filename'] == 'portal') ? 'activePage nav-link' : 'nav-link' ?>">Admin Portal</a>
            <a href="./send_custom_email.php" class="<?= ($pathParts['filename'] == 'send_custom_email') ? 'activePage nav-link' : 'nav-link' ?>">Send Email</a>
        <?php endif; ?>
    </nav>
</header>