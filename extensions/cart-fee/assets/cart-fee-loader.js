(() => {
  window.__cartFeeAssetsLoading ??= null;

  async function loadCartFeeAssets() {
    if (window.__cartFeeAssetsLoading) {
      return window.__cartFeeAssetsLoading;
    }

    window.__cartFeeAssetsLoading = loadCartFeeAssetsInternal();

    try {
      await window.__cartFeeAssetsLoading;
    } finally {
      window.__cartFeeAssetsLoading = null;
    }
  }

  async function loadCartFeeAssetsInternal() {
    const cartFee = document.querySelector('[data-cart-fee]');
    if (!cartFee) return;

    try {
      const settingsResponse = await fetch('/apps/cart-fee/settings');

      if (!settingsResponse.ok) {
        throw new Error('Unable to load cart fee settings.');
      }

      const settings = await settingsResponse.json();

      if (!settings.enabled) {
        await cleanUpDisabledFee(settings);
        cartFee.remove();
        return;
      }

      cartFee.preloadedSettings = settings;

      // Load stylesheet only once.
      const styleUrl = cartFee.dataset.cartFeeStyleUrl;

      if (
        styleUrl &&
        !document.querySelector(
          `link[data-cart-fee-asset="style"][href="${CSS.escape(styleUrl)}"]`
        )
      ) {
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = styleUrl;
        stylesheet.dataset.cartFeeAsset = 'style';
        document.head.append(stylesheet);
      }

      // Reuse an existing script instead of injecting it again.
      const scriptUrl = cartFee.dataset.cartFeeScriptUrl;

      if (!scriptUrl) {
        throw new Error('Cart fee script URL is missing.');
      }

      const existingScript = [...document.scripts].find(
        (script) =>
          script.dataset.cartFeeAsset === 'script' &&
          script.src === new URL(scriptUrl, document.baseURI).href
      );

      if (existingScript) {
        // Wait if the existing script is still loading.
        if (existingScript.dataset.loaded !== 'true') {
          await new Promise((resolve, reject) => {
            existingScript.addEventListener('load', resolve, { once: true });
            existingScript.addEventListener(
              'error',
              () => reject(new Error('Unable to load cart fee script.')),
              { once: true }
            );
          });
        }

        return;
      }

      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.dataset.cartFeeAsset = 'script';

      await new Promise((resolve, reject) => {
        script.addEventListener(
          'load',
          () => {
            script.dataset.loaded = 'true';
            resolve();
          },
          { once: true }
        );

        script.addEventListener(
          'error',
          () => {
            script.remove();
            reject(new Error('Unable to load cart fee script.'));
          },
          { once: true }
        );

        document.head.append(script);
      });
    } catch (error) {
      console.error('Cart fee assets loading error:', error);
    }
  }

  async function cleanUpDisabledFee(settings) {
    const cartResponse = await fetch('/cart.js');

    if (!cartResponse.ok) {
      throw new Error('Unable to load the cart.');
    }

    const cart = await cartResponse.json();

    const attributes = {
      cart_fee_enabled: 'false',
      cart_fee_variant_id: settings.feeVariantId || '',
      cart_fee_type: settings.type || '',
      cart_fee_value:
        settings.value == null ? '' : String(settings.value),
      cart_fee_title: settings.title || '',
      cart_fee_info: settings.info || '',
      cart_fee_opt_in:
        cart.attributes?.cart_fee_opt_in === 'true' ? 'true' : 'false',
    };

    const hasAttributeChanges = Object.entries(attributes).some(
      ([key, value]) => cart.attributes?.[key] !== value
    );

    if (hasAttributeChanges) {
      const updateResponse = await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes }),
      });

      if (!updateResponse.ok) {
        throw new Error('Unable to sync disabled cart fee settings.');
      }
    }

    const variantId = Number(settings.feeVariantId?.split('/').pop());

    const feeItem = cart.items.find(
      (item) =>
        Number(item.variant_id) === variantId &&
        item.properties?._cart_fee === 'true'
    );

    if (feeItem) {
      const removeResponse = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: feeItem.key,
          quantity: 0,
        }),
      });

      if (!removeResponse.ok) {
        throw new Error('Unable to remove the disabled cart fee.');
      }
    }
  }

  loadCartFeeAssets();
})();