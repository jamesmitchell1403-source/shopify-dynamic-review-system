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
    let logoBg = "#000000";
    let logoColor = "#FFFFFF";
    let badgeText = "";

    const amazonIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block; vertical-align: -2px;"><path d="M15.93 17.09c-2.83 2.09-6.97 3.21-10.54 1.83-1.67-.64-3.14-1.74-4.22-3.18-.32-.43.08-.94.57-.69 3.65 1.84 8.16 2.37 12.08 1.05.65-.22 1.34.42.89.87zM17.42 15.68c-.28-.36-1.85-.17-2.55-.09-.21.02-.25-.17-.06-.3 1.25-.85 3.23-.61 3.48-.3.26.31-.08 2.29-1.25 3.24-.18.15-.35.07-.27-.14.28-.68.93-2.05.65-2.41z"/></svg>`;
    const flipkartIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#FFE11B" style="display:inline-block; vertical-align: -2px;"><path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm0 10c-2.76 0-5-2.24-5-5h2c0 1.66 1.34 3 3 3s3-1.34 3-3h2c0 2.76-2.24 5-5 5z"/></svg>`;
    const alibabaIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block; vertical-align: -2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;

    if (source === "IMPORTED_AMAZON") {
      badgeText = `By ${amazonIcon} Amazon`;
      logoBg = "#FF9900";
      logoColor = "#000000";
    } else if (source === "IMPORTED_FLIPKART") {
      badgeText = `By ${flipkartIcon} Flipkart`;
      logoBg = "#2874F0";
      logoColor = "#FFFFFF";
    } else if (source === "IMPORTED_ALIBABA") {
      badgeText = `By ${alibabaIcon} Alibaba`;
      logoBg = "#FF6A00";
      logoColor = "#FFFFFF";
    } else {
      return `<span class="rw-customer-type">Verified Customer</span>`;
    }

    const badgeContent = `<span style="background: ${logoBg}; color: ${logoColor}; font-weight: 700; font-size: 11px; padding: 4px 8px; border-radius: 5px; display: inline-flex; align-items: center; gap: 4px; cursor: ${externalUrl ? 'pointer' : 'default'}; box-shadow: 0 1px 3px rgba(0,0,0,0.15);">${badgeText} ${externalUrl ? '↗' : ''}</span>`;

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

