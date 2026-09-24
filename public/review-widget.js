(function () {
  'use strict';

  // Strictly restrict popup widget to Product pages (/products/*)
  const isProductPage = window.location.pathname.includes('/products/') ||
                        (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.page && window.ShopifyAnalytics.meta.page.pageType === 'product') ||
                        (window.meta && window.meta.page && window.meta.page.pageType === 'product') ||
                        document.getElementById('dynamic-review-widget-root');

  if (!isProductPage) {
    return; // Exit completely on non-product pages (homepage, collections, cart, etc.)
  }

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
    let brandText = "";

    if (source === "IMPORTED_AMAZON") {
      brandText = "By Amazon";
    } else if (source === "IMPORTED_FLIPKART") {
      brandText = "By Flipkart";
    } else if (source === "IMPORTED_ALIBABA") {
      brandText = "By Alibaba";
    } else {
      return `<span class="rw-customer-type">Verified Customer</span>`;
    }

    const badgeContent = `<span style="background: #000000; color: #ffffff; font-weight: 600; font-size: 11px; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 3px; cursor: ${externalUrl ? 'pointer' : 'default'};">${brandText}${externalUrl ? ' ↗' : ''}</span>`;

    if (externalUrl) {
      return `<a href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;" onclick="event.stopPropagation();">${badgeContent}</a>`;
    }
    return badgeContent;
  }

  function initWidget(reviews, settings) {
    const position = settings.position || 'bottom-left';
    const layoutStyle = settings.layoutStyle || 'layout-1';
    const delayMs = (settings.delaySeconds !== undefined ? settings.delaySeconds : 1) * 1000;
    const durationMs = (settings.displayDuration || 10) * 1000;
    const rotationMs = (settings.rotationInterval || 2) * 1000;

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

      const hasImage = !!review.imageUrl;
      const hasVideo = !!review.videoUrl;
      const isLayout2 = hasImage && hasVideo; // Image + Video
      const isLayout1 = (hasImage || hasVideo) && !isLayout2; // Image OR Video

      let contentHtml = '';

      if (isLayout1) {
        // LAYOUT 1: Media on Left / Review on Right (Image OR Video)
        const isVideoMedia = hasVideo && !hasImage;
        const mediaHtml = `
          <div class="rw-media-left">
            ${isVideoMedia
              ? `<video src="${escapeHtml(review.videoUrl)}" muted playsinline></video>
                 <div class="rw-media-play-icon">▶</div>
                 <div class="rw-media-time-pill">0:12</div>`
              : `<img src="${escapeHtml(review.imageUrl)}" alt="Review product photo" />`
            }
          </div>
        `;

        contentHtml = `
          <div class="rw-layout-1-wrapper">
            ${mediaHtml}
            <div class="rw-media-right">
              <div class="rw-header" style="margin-bottom: 4px;">
                <div class="rw-user-info">
                  <div class="rw-avatar">${escapeHtml(initials)}</div>
                  <div>
                    <span class="rw-reviewer">${escapeHtml(name)}</span>
                    <span class="rw-stars">${stars}</span>
                  </div>
                </div>
                <button class="rw-close-btn" aria-label="Close review">&times;</button>
              </div>
              <div class="rw-body">“${escapeHtml(bodyText)}”</div>
              <div class="rw-footer" style="margin-top: 4px;">
                <span class="rw-verified-badge">✓ Verified Purchase</span>
                ${marketplaceBadge}
              </div>
            </div>
          </div>
        `;
      } else if (isLayout2) {
        // LAYOUT 2: Media Carousel on Top / Review Below (Image + Video)
        contentHtml = `
          <div class="rw-layout-2-wrapper">
            <div class="rw-carousel-header">
              <div class="rw-carousel-track">
                <div class="rw-carousel-item">
                  <img src="${escapeHtml(review.imageUrl)}" alt="Product photo" />
                </div>
                <div class="rw-carousel-item">
                  <video src="${escapeHtml(review.videoUrl)}" muted playsinline></video>
                  <div class="rw-media-play-icon">▶</div>
                  <div class="rw-media-time-pill">0:12</div>
                </div>
              </div>
              <div class="rw-carousel-dots">
                <span class="rw-carousel-dot active"></span>
                <span class="rw-carousel-dot"></span>
              </div>
            </div>

            <div class="rw-header" style="margin-bottom: 4px;">
              <div class="rw-user-info">
                <div class="rw-avatar">${escapeHtml(initials)}</div>
                <div>
                  <span class="rw-reviewer">${escapeHtml(name)}</span>
                  <span class="rw-stars">${stars}</span>
                </div>
              </div>
              <button class="rw-close-btn" aria-label="Close review">&times;</button>
            </div>

            <div class="rw-body">“${escapeHtml(bodyText)}”</div>

            <div class="rw-footer">
              <span class="rw-verified-badge">✓ Verified Purchase</span>
              ${marketplaceBadge}
            </div>
          </div>
        `;
      } else if (layoutStyle === 'layout-4') {
        // ELEGANT QUOTE CARD (NO MEDIA)
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
        // NORMAL EXISTING REVIEW LAYOUT (NO MEDIA)
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

