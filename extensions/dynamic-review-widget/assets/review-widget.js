(function () {
  'use strict';

  let rootEl = document.getElementById('dynamic-review-widget-root') || document.getElementById('dynamic_review_widget_root') || document.querySelector('[data-product-id]');
  if (rootEl) {
    rootEl.style.minHeight = "1px";
    rootEl.style.display = "block";
  }

  let productId = rootEl ? rootEl.getAttribute('data-product-id') : null;
  let shop = rootEl ? rootEl.getAttribute('data-shop') : null;

  // Fallbacks if element not in DOM or data-product-id missing
  if (!productId && window.meta && window.meta.product) {
    productId = String(window.meta.product.id);
  }
  if (!productId && window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
    productId = String(window.ShopifyAnalytics.meta.product.id);
  }
  if (!productId) {
    productId = "all";
  }

  if (!shop && window.Shopify && window.Shopify.shop) {
    shop = window.Shopify.shop;
  }

  // Retrieve customer tags from localStorage if available (Personalization support)
  let customerTags = [];
  try {
    const stored = localStorage.getItem('customer_quiz_tags');
    if (stored) customerTags = JSON.parse(stored);
  } catch (e) {
    // Ignore
  }

  function getInitials(name) {
    if (!name) return 'RC';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().replace(/[^A-Z]/g, '');
  }

  function fetchReviews(pid) {
    const endpoint = `/apps/reviews/widget?productId=${encodeURIComponent(pid)}&shop=${encodeURIComponent(shop || '')}&customerTags=${encodeURIComponent(JSON.stringify(customerTags))}`;
    return fetch(endpoint).then((res) => res.json());
  }

  fetchReviews(productId)
    .then((data) => {
      if (data && data.reviews && data.reviews.length > 0) {
        initWidget(data.reviews, data.settings || {});
      } else {
        // Fallback to fetch all published reviews for the shop
        fetchReviews("all").then((fallbackData) => {
          if (fallbackData && fallbackData.reviews && fallbackData.reviews.length > 0) {
            initWidget(fallbackData.reviews, fallbackData.settings || {});
          }
        });
      }
    })
    .catch(() => {
      fetchReviews("all").then((fallbackData) => {
        if (fallbackData && fallbackData.reviews && fallbackData.reviews.length > 0) {
          initWidget(fallbackData.reviews, fallbackData.settings || {});
        }
      });
    });

  function getMarketplaceBadgeHtml(source, externalUrl) {
    let logoColor = "#FF9900";
    let brandIcon = "";

    const amazonIcon = `<svg width="20" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block; vertical-align:-4px; margin-left:2px;"><path d="M58.8 35.1c-2-1.7-4.9-2.5-8.8-2.5-5 0-9 1.4-11.8 4.2-2.8 2.8-4.2 6.8-4.2 12.1 0 5 1.3 8.9 4 11.6 2.7 2.7 6.4 4.1 11.2 4.1 4.3 0 7.8-1.2 10.3-3.6v2.6h8V31.7h-8.7v3.4zm-1.1 18.9c-1.8 1.9-4.2 2.8-7.2 2.8-2.7 0-4.8-.8-6.2-2.4-1.4-1.6-2.1-3.9-2.1-6.9 0-3.3.7-5.7 2.1-7.4 1.4-1.7 3.6-2.5 6.4-2.5 2.9 0 5.3.9 7 2.7v13.7z" fill="#FF9900"/><path d="M18 72c18.5 13.5 45.5 14.5 64 2.5 1.5-1 3.5.5 2.5 2-20 13.5-49 12.5-68.5-2.5-1-0.8 0.5-2.8 2-2z" fill="#FF9900"/><path d="M82.5 72.5l6 4-1.5-7.5-4.5 3.5z" fill="#FF9900"/></svg>`;
    const flipkartIcon = `<svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block; vertical-align:-4px; margin-left:2px;"><circle cx="50" cy="50" r="48" fill="#2874F0"/><rect x="25" y="30" width="50" height="48" rx="5" fill="#FFE11B"/><path d="M40 30V22a10 10 0 0120 0v8" stroke="#FFE11B" stroke-width="5" fill="none"/><path d="M42 43h22v6H49v7h12v6H49v14h-7V43z" fill="#2874F0"/></svg>`;
    const alibabaIcon = `<svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block; vertical-align:-4px; margin-left:2px;"><path d="M85 30C70 20 40 25 25 45C15 58 10 75 35 85C60 95 80 80 90 60C95 50 90 35 85 30Z" fill="#FF6A00"/><path d="M38 52c4 4 12 4 16 0" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none"/></svg>`;

    if (source === "IMPORTED_AMAZON") {
      brandIcon = amazonIcon;
      logoColor = "#FF9900";
    } else if (source === "IMPORTED_FLIPKART") {
      brandIcon = flipkartIcon;
      logoColor = "#2874F0";
    } else if (source === "IMPORTED_ALIBABA") {
      brandIcon = alibabaIcon;
      logoColor = "#FF6A00";
    } else {
      return `<span class="rw-customer-type">Verified Customer</span>`;
    }

    const badgeContent = `<span style="background: transparent; color: ${logoColor}; font-weight: 700; font-size: 12px; padding: 0; display: inline-flex; align-items: center; gap: 3px; cursor: ${externalUrl ? 'pointer' : 'default'};">By ${brandIcon}${externalUrl ? ' ↗' : ''}</span>`;

    if (externalUrl) {
      return `<a href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;" onclick="event.stopPropagation();">${badgeContent}</a>`;
    }
    return badgeContent;
  }

  function initWidget(reviews, settings) {
    const position = settings.position || 'bottom-left';
    const layoutStyle = settings.layoutStyle || 'layout-1';
    const delayMs = (settings.delaySeconds || 4) * 1000;
    const durationMs = (settings.displayDuration || 7) * 1000;
    const rotationMs = (settings.rotationInterval || 12) * 1000;

    let currentIndex = 0;
    let isFirstShow = true;

    // Check if card already exists to avoid duplicate widgets
    let card = document.querySelector('.rw-notification-card');
    if (!card) {
      card = document.createElement('div');
      card.className = `rw-notification-card rw-pos-${position} rw-layout-${layoutStyle}`;
      document.body.appendChild(card);
    } else {
      card.className = `rw-notification-card rw-pos-${position} rw-layout-${layoutStyle}`;
    }

    const leftRaySvg = `<svg class="rw-accent-ray rw-accent-left" viewBox="0 0 16 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4L4 8" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M14 14L2 14" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M12 24L4 20" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;

    const rightRaySvg = `<svg class="rw-accent-ray rw-accent-right" viewBox="0 0 16 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4L12 8" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M2 14L14 14" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M4 24L12 20" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;

    function renderReview(review) {
      const name = review.reviewerName || 'Rachel V.';
      const initials = getInitials(name);
      const stars = '★'.repeat(review.rating || 5);
      const bodyText = review.bodyShort || review.bodyFull || '';
      const marketplaceBadge = getMarketplaceBadgeHtml(review.source, review.externalUrl);

      let contentHtml = '';

      if (layoutStyle === 'layout-4') {
        // ELEGANT QUOTE CARD
        contentHtml = `
          <div class="rw-quote-mark">“</div>
          <div class="rw-header">
            <div class="rw-user-info">
              <span class="rw-reviewer">${escapeHtml(name)}</span>
              <span class="rw-stars">${stars}</span>
            </div>
            <button class="rw-close-btn" aria-label="Close review">&times;</button>
          </div>
          <div class="rw-body rw-quote-body">${escapeHtml(bodyText)}</div>
          <div class="rw-footer">
            <span class="rw-verified-badge">✓ Verified Purchase</span>
            ${marketplaceBadge}
          </div>
        `;
      } else {
        // DEFAULT / OTHER LAYOUTS
        contentHtml = `
          <div class="rw-header">
            <div class="rw-user-info">
              <div class="rw-avatar">${escapeHtml(initials)}</div>
              <div>
                <span class="rw-reviewer">${escapeHtml(name)}</span>
                <span class="rw-stars">${stars}</span>
              </div>
            </div>
            <button class="rw-close-btn" aria-label="Close review">&times;</button>
          </div>

          <div class="rw-body-container">
            ${layoutStyle === 'layout-2' || layoutStyle === 'layout-5' ? leftRaySvg : ''}
            <div class="rw-body">“${escapeHtml(bodyText)}”</div>
            ${layoutStyle === 'layout-2' || layoutStyle === 'layout-5' ? rightRaySvg : ''}
          </div>

          <div class="rw-footer">
            <span class="rw-verified-badge">✓ Verified Purchase</span>
            ${marketplaceBadge}
          </div>
        `;
      }

      card.innerHTML = contentHtml;

      // Make whole card clickable if externalUrl exists
      if (review.externalUrl) {
        card.style.cursor = 'pointer';
        card.onclick = (e) => {
          if (e.target && e.target.classList && e.target.classList.contains('rw-close-btn')) return;
          window.open(review.externalUrl, '_blank');
        };
      } else {
        card.style.cursor = 'default';
        card.onclick = null;
      }

      const closeBtn = card.querySelector('.rw-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          card.classList.remove('rw-visible');
        });
      }
    }

    function scheduleNext() {
      if (!reviews || reviews.length === 0) return;

      const waitTime = isFirstShow ? delayMs : rotationMs;
      isFirstShow = false;

      setTimeout(() => {
        const review = reviews[currentIndex % reviews.length];
        renderReview(review);
        card.classList.add('rw-visible');
        currentIndex++;

        setTimeout(() => {
          card.classList.remove('rw-visible');
          scheduleNext();
        }, durationMs);
      }, waitTime);
    }

    scheduleNext();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();

