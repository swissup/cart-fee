async function loadCartFeeAssets() {
  const cartFee = document.querySelector('[data-cart-fee]');
  if (!cartFee) return;

  try {
    const settingsResponse = await fetch('/apps/cart-fee/settings');
    // console.log(settingsResponse);
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

    // load styles
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = cartFee.dataset.cartFeeStyleUrl;
    document.head.append(stylesheet);

    // load script
    const script = document.createElement('script');
    script.src = cartFee.dataset.cartFeeScriptUrl;
    script.async = true;
    document.head.append(script);
  } catch (error) {
    console.error('Cart fee assets loading error:', error);
    cartFee.remove();
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
    cart_fee_value: settings.value == null ? '' : String(settings.value),
    cart_fee_title: settings.title || '',
    cart_fee_info: settings.info || '',
    cart_fee_opt_in: cart.attributes?.cart_fee_opt_in === 'true' ? 'true' : 'false',
  };

  const hasAttributeChanges = Object.entries(attributes).some(
    ([key, value]) => cart.attributes?.[key] !== value,
  );

  if (hasAttributeChanges) {
    const updateResponse = await fetch('/cart/update.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({attributes}),
    });

    if (!updateResponse.ok) {
      throw new Error('Unable to sync disabled cart fee settings.');
    }
  }

  const variantId = Number(settings.feeVariantId?.split('/').pop());
  const feeItem = cart.items.find((item) =>
    Number(item.variant_id) === variantId && item.properties?._cart_fee === 'true',
  );

  if (feeItem) {
    const removeResponse = await fetch('/cart/change.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: feeItem.key, quantity: 0}),
    });

    if (!removeResponse.ok) {
      throw new Error('Unable to remove the disabled cart fee.');
    }
  }
}

loadCartFeeAssets();
