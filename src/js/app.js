/**
 * 81 Buell Utilities - Frontend JavaScript
 * Handles dynamic UI updates like due date badges and AJAX pagination
 */

document.addEventListener('DOMContentLoaded', () => {
    initDueChips();
    initConfirmActions();
    initAjaxPagination();
    initAdminAjaxPagination();
    initAutoSavePayments();
});

/**
 * Initialize due date chips with dynamic text and styling
 * Calculates days until/past due and applies appropriate classes
 */
function initDueChips() {
    const chips = document.querySelectorAll('.due-chip[data-due]');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    chips.forEach(chip => {
        const dueStr = chip.dataset.due;
        const isPaid = chip.dataset.paid === '1';
        
        if (!dueStr) return;

        const dueDate = new Date(dueStr + 'T00:00:00');
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Format the date nicely
        const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
        const dateDisplay = formatter.format(dueDate);

        let label, className;

        if (isPaid) {
            // Bill is paid - show simple "Paid" or just the date
            label = dateDisplay;
            className = 'due-paid';
        } else if (diffDays < 0) {
            label = `${dateDisplay} • Past due ${Math.abs(diffDays)}d`;
            className = 'due-past';
        } else if (diffDays === 0) {
            label = `${dateDisplay} • Due today`;
            className = 'due-soon';
        } else if (diffDays <= 3) {
            label = `${dateDisplay} • Due in ${diffDays}d`;
            className = 'due-soon';
        } else {
            label = `${dateDisplay} • Due in ${diffDays}d`;
            className = 'due-future';
        }

        chip.textContent = label;
        chip.classList.add(className);
        chip.setAttribute('aria-label', `Due date: ${dueStr}`);
    });
}

/**
 * Add confirmation dialogs to destructive actions
 */
function initConfirmActions() {
    // Confirm before sending reminders
    document.querySelectorAll('.reminder-form').forEach(form => {
        form.addEventListener('submit', (e) => {
            if (!confirm('Send reminder email to all unpaid users?')) {
                e.preventDefault();
            }
        });
    });
}

/**
 * AJAX Pagination - loads pages without full reload
 * Keeps scroll position and provides smoother UX
 */
function initAjaxPagination() {
    const paginationNav = document.querySelector('nav.pagination');
    if (!paginationNav) return;

    // Find the bills container (wraps all year tables)
    const billsContainer = document.getElementById('bills-container');
    if (!billsContainer) return;

    paginationNav.addEventListener('click', async (e) => {
        const link = e.target.closest('a.page, a.btn');
        if (!link || link.classList.contains('disabled')) return;
        
        e.preventDefault();
        
        const url = new URL(link.href);
        const page = url.searchParams.get('page');
        if (!page) return;

        // Add loading state
        billsContainer.style.opacity = '0.5';
        billsContainer.style.pointerEvents = 'none';

        try {
            const response = await fetch(url, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            
            if (!response.ok) throw new Error('Network response was not ok');
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Replace bills container content
            const newBills = doc.getElementById('bills-container');
            if (newBills) {
                billsContainer.innerHTML = newBills.innerHTML;
            }
            
            // Replace pagination
            const newPagination = doc.querySelector('nav.pagination');
            if (newPagination) {
                paginationNav.innerHTML = newPagination.innerHTML;
            }
            
            // Update URL without reload
            history.pushState({ page }, '', url);
            
            // Reinitialize due chips for new content
            initDueChips();
            initConfirmActions();
            
            // Smooth scroll to bills section
            billsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (error) {
            console.error('Pagination error:', error);
            // Fallback to normal navigation
            window.location.href = link.href;
        } finally {
            billsContainer.style.opacity = '1';
            billsContainer.style.pointerEvents = 'auto';
        }
    });

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
        location.reload();
    });
}

/**
 * AJAX Pagination for Admin Portal - loads pages without full reload
 */
function initAdminAjaxPagination() {
    const paginationNav = document.querySelector('.admin-area nav.pagination');
    if (!paginationNav) return;

    const adminContainer = document.getElementById('admin-bills-container');
    if (!adminContainer) return;

    paginationNav.addEventListener('click', async (e) => {
        const link = e.target.closest('a.page, a.btn');
        if (!link || link.classList.contains('disabled')) return;
        
        e.preventDefault();
        
        const url = new URL(link.href);
        const page = url.searchParams.get('page');
        if (!page) return;

        // Add loading state
        adminContainer.style.opacity = '0.5';
        adminContainer.style.pointerEvents = 'none';

        try {
            const response = await fetch(url, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            
            if (!response.ok) throw new Error('Network response was not ok');
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Replace admin container content
            const newContainer = doc.getElementById('admin-bills-container');
            if (newContainer) {
                adminContainer.innerHTML = newContainer.innerHTML;
            }
            
            // Replace pagination
            const newPagination = doc.querySelector('.admin-area nav.pagination');
            if (newPagination) {
                paginationNav.innerHTML = newPagination.innerHTML;
            }
            
            // Update URL without reload
            history.pushState({ page }, '', url);
            
            // Reinitialize components for new content
            initDueChips();
            initConfirmActions();
            initAutoSavePayments();
            
            // Smooth scroll to table
            adminContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (error) {
            console.error('Admin pagination error:', error);
            window.location.href = link.href;
        } finally {
            adminContainer.style.opacity = '1';
            adminContainer.style.pointerEvents = 'auto';
        }
    });
}

/**
 * Utility: Format currency
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

/**
 * Utility: Relative time formatter
 */
function relativeTime(date) {
    const now = new Date();
    const diff = date - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return `${Math.abs(days)} days ago`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
}

/**
 * Auto-save payment checkboxes on change (sticky checkboxes)
 * Submits form automatically when any checkbox is toggled
 */
function initAutoSavePayments() {
    const paymentForms = document.querySelectorAll('.payment-form-auto');
    
    paymentForms.forEach(form => {
        const checkboxes = form.querySelectorAll('input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', async () => {
                // Debounce rapid clicks
                if (form.dataset.saving === 'true') return;
                
                form.dataset.saving = 'true';
                form.classList.add('saving');
                
                try {
                    const formData = new FormData(form);
                    
                    const response = await fetch(form.action, {
                        method: 'POST',
                        body: formData,
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error('Save failed');
                    }
                    
                    // Update the badge if status changed
                    const row = form.closest('tr');
                    if (row) {
                        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                        const badge = row.querySelector('.badge');
                        if (badge) {
                            if (allChecked) {
                                badge.className = 'badge badge-paid';
                                badge.textContent = 'Paid';
                            } else {
                                badge.className = 'badge badge-unpaid';
                                badge.textContent = 'Unpaid';
                            }
                        }
                    }
                    
                } catch (error) {
                    console.error('Auto-save error:', error);
                    // Revert checkbox on error
                    checkbox.checked = !checkbox.checked;
                    alert('Failed to save. Please try again.');
                } finally {
                    form.dataset.saving = 'false';
                    form.classList.remove('saving');
                    checkboxes.forEach(cb => cb.disabled = false);
                }
            });
        });
    });
}
