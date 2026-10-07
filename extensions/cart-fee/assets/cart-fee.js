class CartFee extends HTMLElement {
  connectedCallback() {
    this.load();
  }

  async load() {    
    try {
      if (this.dataset.cartFeeRendered === 'true' && !this.hidden) {
        return;
      }

      const existingFee = Array.from(
        document.querySelectorAll('cart-fee[data-cart-fee-rendered="true"]'),
      ).find((feeElement) => feeElement !== this && !feeElement.hidden);

      if (existingFee) {
        this.remove();
        return;
      }

      const [settingsResponse, cartResponse] = await Promise.all([
        fetch('/apps/cart-fee/settings'),
        fetch('/cart.js'),
      ]);

      if (!settingsResponse.ok || !cartResponse.ok) {
        this.remove();
        return;
      }

      const settings = await settingsResponse.json();
      const cart = await cartResponse.json();
      await this.syncCartAttributes(settings, cart).catch((error) => {
        console.error('Cart fee settings sync:', error);
      });

      const variantId = Number(settings.feeVariantId?.split('/').pop());
      const feeItem = Number.isSafeInteger(variantId)
        ? cart.items.find((item) => Number(item.variant_id) === variantId)
        : null;
      const feeType = settings.type || this.dataset.type;
      const feeValue = settings.value ?? this.dataset.value;
      const calculatedFee = this.calculateFee(cart, feeType, feeValue);

      if (!settings.enabled) {
        if (feeItem) {
          const removalResponse = await fetch('/cart/change.js', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: feeItem.key, quantity: 0}),
          });

          if (!removalResponse.ok) {
            throw new Error('Unable to remove the disabled cart fee.');
          }

          window.location.reload();
          return;
        }

        this.remove();
        return;
      }

      if (cart.item_count === 0) {
        this.remove();
        return;
      }

      if (feeType !== 'fixed' && feeItem) {
        const removalResponse = await fetch('/cart/change.js', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({id: feeItem.key, quantity: 0}),
        });

        if (!removalResponse.ok) {
          throw new Error('Unable to remove the inactive cart fee line.');
        }

        window.location.reload();
        return;
      }

      if (feeType === 'fixed' && Number.isSafeInteger(variantId) && !feeItem) {
        const addResponse = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            items: [{
              id: variantId,
              quantity: 1,
              properties: {_cart_fee: 'true'},
            }],
          }),
        });

        if (!addResponse.ok) {
          throw new Error('Unable to add the cart fee to the cart.');
        }

        window.location.reload();
        return;
      }

      const summary = [
        '#main-cart-footer .cart__blocks',
        '.cart-page__summary',
        '.cart-page__footer',
        '.cart__blocks',
        '.cart__footer',
        '[data-cart-summary]',
      ]
        .map((selector) => document.querySelector(selector))
        .find(Boolean);

      if (summary) {
        const totalRow = summary.querySelector(
          '.totals, .cart-totals, .cart-page__totals, .cart__subtotal, [data-cart-total]',
        );

        if (totalRow) {
          totalRow.insertAdjacentElement('beforebegin', this);
        } else {
          summary.prepend(this);
        }
      }

      const fee = feeItem ? Number(feeItem.final_line_price) : calculatedFee;

      if (fee <= 0) {
        this.remove();
        return;
      }

      const titleElement = this.querySelector('.cart-fee__title');
      const valueElement = this.querySelector('.cart-fee__value');

      titleElement.textContent = settings.title || this.dataset.title;
      valueElement.textContent = this.formatMoney(
        fee,
        cart.currency,
      );

      const totalValue = this.findTotalValue(summary);

      if (totalValue) {
        totalValue.textContent = this.formatMoney(
          cart.total_price + (feeItem ? 0 : fee),
          cart.currency,
        );
      }

      this.hidden = false;
      this.dataset.cartFeeRendered = 'true';
    } catch (error) {
      console.error('Cart fee:', error);
      this.remove();
    }
  }

  async syncCartAttributes(settings, cart) {
    const attributes = {
      cart_fee_enabled: String(Boolean(settings.enabled)),
      cart_fee_variant_id: settings.feeVariantId || '',
      cart_fee_type: settings.type || '',
      cart_fee_value: settings.value == null ? '' : String(settings.value),
      cart_fee_title: settings.title || '',
    };
    const hasChanges = Object.entries(attributes).some(
      ([key, value]) => cart.attributes?.[key] !== value,
    );

    if (!hasChanges) {
      return;
    }

    const response = await fetch('/cart/update.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({attributes}),
    });

    if (!response.ok) {
      throw new Error('Unable to sync cart fee settings.');
    }
  }

  calculateFee(cart, type, configuredValue) {
    const value = Number(configuredValue);

    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }

    if (type === 'fixed') {
      return Math.round(value * 100);
    }

    if (type === 'percentage') {
      return Math.round(cart.total_price * value / 100);
    }

    return 0;
  }

  findTotalValue(summary) {
    if (!summary) {
      return null;
    }

    const totalValue = summary.querySelector(
      '.totals__total-value, .cart-total__value, .cart-page__total-value, .cart-summary__total-value, [data-cart-total-value]',
    );

    if (totalValue) {
      return totalValue;
    }

    const totalRows = Array.from(summary.querySelectorAll('*'))
      .filter((element) => {
        const text = element.textContent.trim();
        return /\btotal\b/i.test(text) && !/\bsubtotal\b/i.test(text);
      })
      .sort((left, right) => left.textContent.length - right.textContent.length);

    for (const totalRow of totalRows) {
      const amount = Array.from(totalRow.querySelectorAll('*'))
        .reverse()
        .find((element) => element.children.length === 0 && /\d/.test(element.textContent));

      if (amount) {
        return amount;
      }
    }

    return null;
  }

  formatMoney(cents, currency) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(cents / 100);
  }
}

if (!customElements.get('cart-fee')) {
  customElements.define('cart-fee', CartFee);
}