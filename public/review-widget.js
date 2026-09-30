(function () {
  'use strict';

  if (window.__rw_widget_initialized) {
    return; // Strictly prevent duplicate script execution / multiple popup loops
  }
  window.__rw_widget_initialized = true;

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
  if (!productHandle && window.location && window.location.pathname && window.location.pathname.includes('/products/')) {
    const parts = window.location.pathname.split('/products/');
    if (parts[1]) {
      productHandle = parts[1].split('/')[0].split('?')[0];
    }
  }
  if (!productId && productHandle) {
    productId = productHandle;
  }
  if (!productId && !productHandle) {
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
    const endpoint = `/apps/reviews/widget?productId=${encodeURIComponent(pid)}&productHandle=${encodeURIComponent(productHandle || '')}&shop=${encodeURIComponent(shop || '')}&customerTags=${encodeURIComponent(JSON.stringify(customerTags))}&_t=${Date.now()}`;
    return fetch(endpoint, { cache: "no-store" }).then((res) => res.json());
  }

  fetchReviews(productId)
    .then((data) => {
      const avg = data && data.averageRating ? data.averageRating : "0.0";
      const count = data && data.totalCount !== undefined ? data.totalCount : (data && data.reviews ? data.reviews.length : 0);
      updateReviewBadges(avg, count);

      if (data && data.reviews && data.reviews.length > 0) {
        initWidget(data.reviews, data.settings || {});
      } else {
        const cards = document.querySelectorAll('.rw-notification-card');
        cards.forEach((card) => card.remove());
      }
    })
    .catch(() => {
      const cards = document.querySelectorAll('.rw-notification-card');
      cards.forEach((card) => card.remove());
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
    if (window.__rw_widget_running) return;
    window.__rw_widget_running = true;

    let position = settings.position || 'bottom-left';
    if (position === 'bottom-right') {
      position = 'bottom-left';
    }
    const rawStyle = settings.layoutStyle || 'layout-1';
    const layoutStyle = rawStyle.startsWith('layout-') ? rawStyle : `layout-${rawStyle}`;
    const layoutClass = `rw-layout-${layoutStyle}`;

    const delayMs = (settings.delaySeconds !== undefined ? settings.delaySeconds : 1) * 1000;
    const durationMs = (settings.displayDuration || 10) * 1000;
    const rotationMs = (settings.rotationInterval || 2) * 1000;

    let currentIndex = 0;
    let isFirstShow = true;

    let durationTimer = null;
    let isVideoPlaying = false;

    function clearHideTimer() {
      if (durationTimer) {
        clearTimeout(durationTimer);
        durationTimer = null;
      }
    }

    function startHideTimer() {
      clearHideTimer();
      if (isVideoPlaying) return;

      durationTimer = setTimeout(function() {
        if (isVideoPlaying) return;
        card.classList.remove('rw-visible');
        setTimeout(function() {
          card.innerHTML = '';
          card.className = `rw-notification-card rw-pos-${position} ${layoutClass}`;
          scheduleNext();
        }, 500);
      }, durationMs);
    }

    // Preload ALL review images and avatars in advance at startup
    if (reviews && reviews.length > 0) {
      reviews.forEach(function (r) {
        const isValidUrl = function(url) {
          if (!url || typeof url !== 'string') return false;
          var u = url.trim();
          return u.length > 5 && (u.startsWith('http') || u.startsWith('data:') || u.startsWith('//') || u.startsWith('/'));
        };
        if (isValidUrl(r.imageUrl)) {
          const img1 = new Image();
          img1.src = r.imageUrl;
        }
        if (isValidUrl(r.avatarUrl)) {
          const img2 = new Image();
          img2.src = r.avatarUrl;
        }
      });
    }

    // Check if card already exists to avoid duplicate widgets
    let card = document.querySelector('.rw-notification-card');
    if (!card) {
      card = document.createElement('div');
      card.className = `rw-notification-card rw-pos-${position} ${layoutClass}`;
      document.body.appendChild(card);
    } else {
      card.className = `rw-notification-card rw-pos-${position} ${layoutClass}`;
    }

    function renderReview(review) {
      const name = review.reviewerName || 'Rachel V.';
      const initials = getInitials(name);
      const stars = '★'.repeat(review.rating || 5);
      const bodyText = review.bodyShort || review.bodyFull || '';
      const marketplaceBadge = getMarketplaceBadgeHtml(review.source, review.externalUrl);

      const isValidUrl = function(url) {
        if (!url || typeof url !== 'string') return false;
        var u = url.trim();
        return u.length > 5 && (u.startsWith('http') || u.startsWith('data:') || u.startsWith('//') || u.startsWith('/'));
      };
      const hasImage = isValidUrl(review.imageUrl);
      const hasVideo = isValidUrl(review.videoUrl);

      // Determine Option 1, 2, 3 vs Option 4 layout
      const isOption1 = hasImage && !hasVideo;        // Option 1: Image
      const isOption2 = hasVideo && !hasImage;        // Option 2: Video
      const isOption3 = hasImage && hasVideo;         // Option 3: Image + Video
      const isOption4 = !hasImage && !hasVideo;       // Option 4: No Image & Video (Text-Only)

      // Always use circular initials badge generated from reviewer name (no photo avatar)
      const avatarClass = 'rw-avatar';
      const avatarHtml = escapeHtml(initials);

      // Add/remove layout modifier classes on card
      if (isOption1 || isOption2) {
        card.classList.add('rw-has-media-1');
        card.classList.remove('rw-has-media-2');
      } else if (isOption3) {
        card.classList.add('rw-has-media-2');
        card.classList.remove('rw-has-media-1');
      } else {
        // Option 4: No Image & Video - Text Only
        card.classList.remove('rw-has-media-1');
        card.classList.remove('rw-has-media-2');
      }

      let contentHtml = '';

      if (isOption1 || isOption2) {
        // =========================================================
        // OPTIONS 1 & 2: MEDIA-BASED STRUCTURE (IMAGE OR VIDEO)
        // Dynamically adjusts based on selected media type
        // =========================================================
        const mediaHtml = `
          <div class="rw-media-left">
            ${isOption2
              ? `<video src="${escapeHtml(review.videoUrl)}" playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;display:block;cursor:pointer;"></video>
                 <div class="rw-media-play-icon" style="cursor:pointer;">▶</div>
                 <div class="rw-media-eye-icon" title="Preview Video" data-type="video" data-src="${escapeHtml(review.videoUrl)}">
                   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                 </div>`
              : `<img src="${escapeHtml(review.imageUrl)}" alt="Review product photo" loading="eager" fetchpriority="high" style="width:100%;height:100%;object-fit:cover;display:block;" />
                 <div class="rw-media-eye-icon" title="Preview Image" data-type="image" data-src="${escapeHtml(review.imageUrl)}">
                   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                 </div>`
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
      } else if (isOption3) {
        // =========================================================
        // OPTION 3: MEDIA-BASED STRUCTURE (IMAGE + VIDEO)
        // =========================================================
        contentHtml = `
          <div class="rw-layout-2-wrapper">
            <div class="rw-carousel-header">
              <div class="rw-carousel-track">
                <div class="rw-carousel-item">
                  <img src="${escapeHtml(review.imageUrl)}" alt="Product photo" loading="eager" fetchpriority="high" />
                  <div class="rw-media-eye-icon" title="Preview Image" data-type="image" data-src="${escapeHtml(review.imageUrl)}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </div>
                </div>
                <div class="rw-carousel-item">
                  <video src="${escapeHtml(review.videoUrl)}" playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;display:block;cursor:pointer;"></video>
                  <div class="rw-media-play-icon" style="cursor:pointer;">▶</div>
                  <div class="rw-media-eye-icon" title="Preview Video" data-type="video" data-src="${escapeHtml(review.videoUrl)}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </div>
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
      } else {
        // =========================================================
        // OPTION 4: SEPARATE TEXT-ONLY STRUCTURE (NO IMAGE & VIDEO)
        // Completely separated from media elements
        // =========================================================
        if (layoutStyle === 'layout-4') {
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

      // Attach manual play/pause handlers and timer pause logic for videos
      const videoEls = card.querySelectorAll('video');
      videoEls.forEach(function(videoEl) {
        const playBtn = videoEl.parentElement ? videoEl.parentElement.querySelector('.rw-media-play-icon') : null;

        const setPlayBtnVisibility = function(visible) {
          if (!playBtn) return;
          if (visible) {
            playBtn.classList.remove('rw-hidden');
            playBtn.style.setProperty('display', 'flex', 'important');
            playBtn.style.setProperty('opacity', '1', 'important');
            playBtn.style.setProperty('visibility', 'visible', 'important');
          } else {
            playBtn.classList.add('rw-hidden');
            playBtn.style.setProperty('display', 'none', 'important');
            playBtn.style.setProperty('opacity', '0', 'important');
            playBtn.style.setProperty('visibility', 'hidden', 'important');
          }
        };

        // Video starts paused initially
        setPlayBtnVisibility(true);

        const togglePlay = function(e) {
          e.stopPropagation();
          if (videoEl.paused) {
            videoEl.play();
          } else {
            videoEl.pause();
          }
        };

        if (playBtn) playBtn.addEventListener('click', togglePlay);
        videoEl.addEventListener('click', togglePlay);

        videoEl.addEventListener('play', function() {
          isVideoPlaying = true;
          setPlayBtnVisibility(false);
          clearHideTimer(); // Pause review popup rotation timer while watching video!
        });

        videoEl.addEventListener('pause', function() {
          isVideoPlaying = false;
          setPlayBtnVisibility(true);
          startHideTimer(); // Resume normal duration timer if user pauses video
        });

        videoEl.addEventListener('ended', function() {
          isVideoPlaying = false;
          setPlayBtnVisibility(true);
          clearHideTimer();
          // Once video has completely finished, wait 1.5s then rotate to next review
          setTimeout(function() {
            card.classList.remove('rw-visible');
            setTimeout(function() {
              card.innerHTML = '';
              card.className = `rw-notification-card rw-pos-${position} ${layoutClass}`;
              scheduleNext();
            }, 500);
          }, 1500);
        });
      });

      // Attach eye icon preview modal handlers
      const eyeBtns = card.querySelectorAll('.rw-media-eye-icon');
      eyeBtns.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          const mediaType = btn.getAttribute('data-type');
          const mediaSrc = btn.getAttribute('data-src');

          // Pause any video inside the review card
          videoEls.forEach(function(v) { if (!v.paused) v.pause(); });
          clearHideTimer();

          openPreviewModal(mediaType, mediaSrc);
        });
      });
    }

    function getOrCreatePreviewModal() {
      let modal = document.getElementById('rw-preview-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'rw-preview-modal';
        modal.className = 'rw-preview-modal';
        modal.innerHTML = `
          <div class="rw-preview-backdrop"></div>
          <div class="rw-preview-dialog">
            <button class="rw-preview-close" aria-label="Close preview">&times;</button>
            <div class="rw-preview-content"></div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeHandler = function(e) {
          if (e.target.closest('.rw-preview-close')) {
            e.stopPropagation();
            closePreviewModal();
            return;
          }
          const dialog = modal.querySelector('.rw-preview-dialog');
          if (dialog && dialog.contains(e.target)) {
            return;
          }
          e.stopPropagation();
          closePreviewModal();
        };

        modal.addEventListener('click', closeHandler);

        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape' || e.key === 'Esc') {
            closePreviewModal();
          }
        });
      }
      return modal;
    }

    function openPreviewModal(type, src) {
      if (!src) return;
      const modal = getOrCreatePreviewModal();
      const content = modal.querySelector('.rw-preview-content');
      const backdrop = modal.querySelector('.rw-preview-backdrop');
      const dialog = modal.querySelector('.rw-preview-dialog');
      if (!content) return;

      if (type === 'video') {
        content.innerHTML = `<video src="${escapeHtml(src)}" autoplay controls playsinline></video>`;
        const vid = content.querySelector('video');
        if (vid) {
          vid.play().catch(function() {});
        }
      } else {
        content.innerHTML = `<img src="${escapeHtml(src)}" alt="Enlarged review media" />`;
      }

      if (modal) {
        modal.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; background-color: rgba(0, 0, 0, 0.72) !important; backdrop-filter: blur(6px) !important; -webkit-backdrop-filter: blur(6px) !important; z-index: 9999998 !important; display: flex !important; align-items: center !important; justify-content: center !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; margin: 0 !important; padding: 0 !important;';
      }
      if (backdrop) {
        backdrop.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; background-color: rgba(0, 0, 0, 0.72) !important; z-index: 1 !important; cursor: pointer !important; margin: 0 !important; padding: 0 !important;';
      }
      if (dialog) {
        dialog.style.cssText = 'position: relative !important; z-index: 99999999 !important; width: 720px !important; height: 480px !important; max-width: 90vw !important; max-height: 80vh !important; background: #000000 !important; border-radius: 16px !important; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6) !important; border: 1px solid rgba(255, 255, 255, 0.15) !important; overflow: hidden !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important;';
      }

      try {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        document.body.classList.add('rw-modal-open');
        document.documentElement.classList.add('rw-modal-open');
      } catch (e) {}

      modal.classList.add('rw-active');
    }

    function closePreviewModal() {
      const modal = document.getElementById('rw-preview-modal');
      if (modal) {
        modal.style.opacity = '0';
        modal.style.visibility = 'hidden';
        modal.style.pointerEvents = 'none';
        modal.classList.remove('rw-active');
        const content = modal.querySelector('.rw-preview-content');
        if (content) {
          const vid = content.querySelector('video');
          if (vid) {
            vid.pause();
          }
          setTimeout(function() {
            if (!modal.classList.contains('rw-active')) {
              content.innerHTML = '';
            }
          }, 300);
        }
      }

      try {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.body.classList.remove('rw-modal-open');
        document.documentElement.classList.remove('rw-modal-open');
      } catch (e) {}

      if (!isVideoPlaying) {
        startHideTimer();
      }
    }

    function preloadSingleImage(url) {
      return new Promise(function(resolve) {
        if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
          resolve();
          return;
        }

        const img = new Image();
        let isDone = false;

        const finish = function() {
          if (isDone) return;
          isDone = true;
          resolve();
        };

        img.onload = function() {
          if (typeof img.decode === 'function') {
            img.decode().then(finish).catch(finish);
          } else {
            finish();
          }
        };

        img.onerror = finish;
        img.src = url;

        if (img.complete && img.naturalWidth > 0) {
          if (typeof img.decode === 'function') {
            img.decode().then(finish).catch(finish);
          } else {
            finish();
          }
        }
      });
    }

    function displayReviewWithMediaPreload(review, showCallback) {
      const isValidUrl = function(url) {
        if (!url || typeof url !== 'string') return false;
        var u = url.trim();
        return u.length > 5 && (u.startsWith('http') || u.startsWith('data:') || u.startsWith('//') || u.startsWith('/'));
      };
      const imagePromises = [];

      if (isValidUrl(review.imageUrl)) {
        imagePromises.push(preloadSingleImage(review.imageUrl));
      }
      if (isValidUrl(review.avatarUrl) && review.avatarUrl !== review.imageUrl) {
        imagePromises.push(preloadSingleImage(review.avatarUrl));
      }

      let hasTriggered = false;
      const executeShow = function() {
        if (hasTriggered) return;
        hasTriggered = true;

        // Render HTML into card element offscreen while card is invisible
        renderReview(review);

        // Allow browser layout engine 2 animation frames to paint image textures before making card visible
        if (window.requestAnimationFrame) {
          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              showCallback();
            });
          });
        } else {
          showCallback();
        }
      };

      if (imagePromises.length === 0) {
        executeShow();
        return;
      }

      // Safety timeout: Never hang card indefinitely if network fails
      const safetyTimer = setTimeout(function() {
        executeShow();
      }, 3000);

      Promise.all(imagePromises)
        .then(function() {
          clearTimeout(safetyTimer);
          executeShow();
        })
        .catch(function() {
          clearTimeout(safetyTimer);
          executeShow();
        });
    }

    function scheduleNext() {
      if (!reviews || reviews.length === 0) return;

      const waitTime = isFirstShow ? delayMs : rotationMs;
      isFirstShow = false;

      setTimeout(function() {
        const review = reviews[currentIndex % reviews.length];
        let hasShown = false;
        const triggerShow = function() {
          if (hasShown) return;
          hasShown = true;
          isVideoPlaying = false;
          card.classList.add('rw-visible');

          startHideTimer();
        };

        displayReviewWithMediaPreload(review, triggerShow);
        currentIndex++;
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

