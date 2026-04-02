# Deploying (e.g. UVM Silk)

This is already wired in the repo: **`.htaccess` files** and **Composer** protect sensitive paths. You mainly **sync files** and **set `.env`**.

## 1. What to upload

Upload the **whole utilities project** into your subdomain folder (e.g. `utilities.aperkel.w3.uvm.edu-root/`), with this shape:

```text
your-site-root/
├── .htaccess          ← from repo web/.htaccess (see note below)
├── .env               ← create on server; never commit real secrets
├── index.php, portal.php, …   ← all PHP/CSS/JS from repo web/
├── cal.ics            ← optional; app can recreate
├── css/  js/  previews/  public/
├── includes/          ← includes .htaccess (Apache: deny web access)
├── scripts/           ← includes .htaccess
└── vendor/            ← run composer on server; post-install adds vendor/.htaccess
```

**Note:** In the Git repo, `.htaccess` lives in `web/`. On Silk your **document root is that whole site folder**, so the file from `web/.htaccess` in the repo should sit next to `index.php` (same level as `includes/`).

## 2. On the server

```bash
cd ~/utilities.aperkel.w3.uvm.edu-root   # or your path
composer install --no-dev
```

`composer install` creates **`vendor/.htaccess`** automatically (`Require all denied`).

## 3. `.env`

Copy from `.env.example` and set at least `DB_*` and `APP_BASE_URL`.

For **flat** layout (index.php next to `includes/`):

```env
APP_WEB_ROOT=.
```

For **local Mac** with `composer serve`, **remove** `APP_WEB_ROOT` or leave it unset so the app uses the `web/` subfolder.

## 4. Apache rules (already in the repo)

| File | Role |
|------|------|
| **Site root `.htaccess`** | Blocks `.env` URLs; `RewriteRule` returns **403** for `/includes/`, `/vendor/`, `/scripts/`; then your CAS rules. |
| **`includes/.htaccess`** | `Require all denied` if something bypasses the root rules. |
| **`scripts/.htaccess`** | Same. |
| **`vendor/.htaccess`** | Written by Composer after install. |

If `/includes/` still loads in a browser, the server may not allow `AllowOverride` for these directives — open a ticket with UVM hosting.

## 5. Quick checks

- Open your site; log in with CAS.
- Visit `https://yoursite/.env` → should be **403** or **404**, not file contents.
- Visit `https://yoursite/includes/connect-DB.php` → **403**.
