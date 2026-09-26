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
  let productHandle = rootEl ? rootEl.getAttribute('data-product-handle') : null;
  let shop = rootEl ? rootEl.getAttribute('data-shop') : null;

  // Fallbacks if element not in DOM or data-product-id missing
  if (!productId && window.meta && window.meta.product) {
    productId = String(window.meta.product.id);
  }
  if (!productHandle && window.meta && window.meta.product) {
    productHandle = window.meta.product.handle;
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

  function updateReviewBadges(avgRating, totalCount) {
    const badgeElements = document.querySelectorAll('.dynamic-review-badge-wrapper');
    if (!badgeElements || badgeElements.length === 0) return;

    const countInt = Number(totalCount) || 0;
    const countText = countInt === 1 ? '1 review' : `${countInt} reviews`;
    const numRating = Number(avgRating) || 5.0;
    const roundedStars = Math.min(Math.max(Math.round(numRating), 1), 5);
    const starString = '★'.repeat(roundedStars) + '☆'.repeat(5 - roundedStars);

    badgeElements.forEach((badge) => {
      const ratingEl = badge.querySelector('.dynamic-review-badge-rating');
      const countEl = badge.querySelector('.dynamic-review-badge-count');
      const starsEl = badge.querySelector('.dynamic-review-badge-stars');

      if (ratingEl) ratingEl.style.display = "none";
      if (countEl) countEl.textContent = countText;
      if (starsEl) starsEl.textContent = starString;
    });
  }

  function fetchReviews(pid) {
    const endpoint = `/apps/reviews/widget?productId=${encodeURIComponent(pid)}&productHandle=${encodeURIComponent(productHandle || '')}&shop=${encodeURIComponent(shop || '')}&customerTags=${encodeURIComponent(JSON.stringify(customerTags))}`;
    return fetch(endpoint).then((res) => res.json());
  }

  fetchReviews(productId)
    .then((data) => {
      const avg = data && data.averageRating ? data.averageRating : "5.0";
      const count = data && data.totalCount !== undefined ? data.totalCount : (data && data.reviews ? data.reviews.length : 0);
      updateReviewBadges(avg, count);

      if (data && data.reviews && data.reviews.length > 0) {
        initWidget(data.reviews, data.settings || {});
      } else {
        const card = document.querySelector('.rw-notification-card');
        if (card) card.classList.remove('rw-visible');
      }
    })
    .catch(() => {
      const card = document.querySelector('.rw-notification-card');
      if (card) card.classList.remove('rw-visible');
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
    let position = settings.position || 'bottom-left';
    if (position === 'bottom-right') {
      position = 'bottom-left';
    }
    const layoutStyle = settings.layoutStyle || 'layout-1';
    const delayMs = (settings.delaySeconds !== undefined ? settings.delaySeconds : 1) * 1000;
    const durationMs = (settings.displayDuration || 10) * 1000;
    const rotationMs = (settings.rotationInterval || 2) * 1000;

    let currentIndex = 0;
    let isFirstShow = true;

    // Preload ALL review images and avatars in advance at startup
    if (reviews && reviews.length > 0) {
      reviews.forEach(function (r, idx) {
        if (!r.imageUrl) {
          const prodName = productHandle || productId || "Product";
          const seedStr = (r.id || r.reviewerName || ("rev_" + idx)) + "";
          const numSeed = Math.abs(seedStr.split("").reduce(function (acc, c) { return acc + c.charCodeAt(0); }, 0));
          const samplePhotos = [
            "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80"
          ];
          r.imageUrl = samplePhotos[numSeed % samplePhotos.length] + "&prod=" + encodeURIComponent(prodName);
        }
        if (r.imageUrl) {
          const img1 = new Image();
          img1.src = r.imageUrl;
        }
        if (r.avatarUrl) {
          const img2 = new Image();
          img2.src = r.avatarUrl;
        }
      });
    }

    // Check if card already exists to avoid duplicate widgets
    let card = document.querySelector('.rw-notification-card');
    if (!card) {
      card = document.createElement('div');
      card.className = `rw-notification-card rw-pos-${position} rw-layout-${layoutStyle}`;
      document.body.appendChild(card);
    } else {
      card.className = `rw-notification-card rw-pos-${position} rw-layout-${layoutStyle}`;
    }

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

      const avatarPhoto = review.avatarUrl || (review.imageUrl && !isLayout1 && !isLayout2 ? review.imageUrl : null);
      const avatarClass = avatarPhoto ? 'rw-avatar has-photo' : 'rw-avatar';
      const avatarHtml = avatarPhoto
        ? `<img src="${escapeHtml(avatarPhoto)}" alt="${escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`
        : escapeHtml(initials);

      if (isLayout1) {
        card.classList.add('rw-has-media-1');
        card.classList.remove('rw-has-media-2');
      } else if (isLayout2) {
        card.classList.add('rw-has-media-2');
        card.classList.remove('rw-has-media-1');
      } else {
        card.classList.remove('rw-has-media-1');
        card.classList.remove('rw-has-media-2');
      }

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
                  <div class="${avatarClass}">${avatarHtml}</div>
                  <div>
                    <div class="rw-reviewer-title">
                      <span class="rw-reviewer">${escapeHtml(name)}</span>
                      <span class="rw-stars">${stars}</span>
                    </div>
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
                <div class="${avatarClass}">${avatarHtml}</div>
                <div>
                  <div class="rw-reviewer-title">
                    <span class="rw-reviewer">${escapeHtml(name)}</span>
                    <span class="rw-stars">${stars}</span>
                  </div>
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
        // LAYOUT 4: ELEGANT QUOTE CARD (NO MEDIA)
        contentHtml = `
          <div class="rw-quote-header">
            <div class="rw-quote-mark">“</div>
            <button class="rw-close-btn" aria-label="Close review">&times;</button>
          </div>
          <div class="rw-header" style="margin-bottom: 6px;">
            <div class="rw-user-info">
              <div class="${avatarClass}">${avatarHtml}</div>
              <div class="rw-reviewer-title">
                <span class="rw-reviewer">${escapeHtml(name)}</span>
                <span class="rw-stars">${stars}</span>
              </div>
            </div>
          </div>
          <div class="rw-body rw-quote-body">${escapeHtml(bodyText)}</div>
          <div class="rw-footer" style="margin-top: 10px;">
            <span class="rw-verified-badge">✓ Verified Purchase</span>
            ${marketplaceBadge}
          </div>
        `;
      } else {
        // NORMAL EXISTING REVIEW LAYOUT (NO MEDIA)
        contentHtml = `
          <div class="rw-header">
            <div class="rw-user-info">
              <div class="${avatarClass}">${avatarHtml}</div>
              <div>
                <div class="rw-reviewer-title">
                  <span class="rw-reviewer">${escapeHtml(name)}</span>
                  <span class="rw-stars">${stars}</span>
                </div>
              </div>
            </div>
            <button class="rw-close-btn" aria-label="Close review">&times;</button>
          </div>

          <div class="rw-body">“${escapeHtml(bodyText)}”</div>

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

    function displayReviewWithMediaPreload(review, showCallback) {
      const urls = [];
      if (review.imageUrl) urls.push(review.imageUrl);
      if (review.avatarUrl && review.avatarUrl !== review.imageUrl) urls.push(review.avatarUrl);

      if (urls.length === 0) {
        renderReview(review);
        showCallback();
        return;
      }

      let loaded = 0;
      let hasCalled = false;

      const done = () => {
        if (hasCalled) return;
        loaded++;
        if (loaded >= urls.length) {
          hasCalled = true;
          renderReview(review);
          showCallback();
        }
      };

      const safetyTimer = setTimeout(() => {
        if (!hasCalled) {
          hasCalled = true;
          renderReview(review);
          showCallback();
        }
      }, 2500);

      urls.forEach(function (url) {
        const img = new Image();
        img.onload = done;
        img.onerror = done;
        img.src = url;
        if (img.complete && img.naturalWidth > 0) {
          done();
        }
      });
    }

    function scheduleNext() {
      if (!reviews || reviews.length === 0) return;

      const waitTime = isFirstShow ? delayMs : rotationMs;
      isFirstShow = false;

      setTimeout(() => {
        const review = reviews[currentIndex % reviews.length];
        let hasShown = false;
        const triggerShow = () => {
          if (hasShown) return;
          hasShown = true;
          card.classList.add('rw-visible');
        };

        displayReviewWithMediaPreload(review, triggerShow);
        currentIndex++;

        setTimeout(() => {
          card.classList.remove('rw-visible');
          // Allow 500ms for exit fade-out transition before scheduling next cycle
          setTimeout(() => {
            scheduleNext();
          }, 500);
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

