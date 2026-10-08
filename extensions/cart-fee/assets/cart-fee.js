let feeCartMutationQueue = Promise.resolve();

function queueFeeCartMutation(operation) {
  const result = feeCartMutationQueue.then(operation, operation);
  feeCartMutationQueue = result.catch(() => {});
  return result;
}

class CartFee extends HTMLElement {
  connectedCallback() {
    this.load();
  }

  async load() {
    try {
      if (this.dataset.cartFeeRendered === 'true' && !this.hidden) return;

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
        throw new Error('Unable to load cart fee settings or cart.');
      }

      const settings = await settingsResponse.json();
      let cart = await cartResponse.json();
      await this.syncCartAttributes(settings, cart);

      this.settings = settings;
      this.variantId = Number(settings.feeVariantId?.split('/').pop());
      this.feeType = settings.type || this.dataset.type;
      this.feeValue = settings.value ?? this.dataset.value;

      let feeItem = this.findFeeItem(cart);      
      // if (feeItem) {
      //   this.hideFeeItem(feeItem);
      // }
      const hasMerchandise = cart.items.some((item) => item !== feeItem);      
      const optedIn = cart.attributes?.cart_fee_opt_in === 'true';

      if (!settings.enabled || !hasMerchandise) {
        if (feeItem) {
          await this.removeFeeItem();
        }
        this.remove();
        return;
      }

      if (feeItem && (!optedIn || this.feeType !== 'fixed')) {
        cart = await this.removeFeeItem();
        feeItem = null;
      } else if (optedIn && this.feeType === 'fixed' && Number.isSafeInteger(this.variantId)) {
        cart = await this.ensureSingleFeeItem();
        feeItem = this.findFeeItem(cart);
      }

      const totalValue = this.findTotalValue(document);
      const totalRow = this.findTotalRow(totalValue);
      this.totalValueElement = totalValue;
      if (totalRow) totalRow.insertAdjacentElement('beforebegin', this);

      this.totalValueElement = totalValue;
      this.querySelector('.cart-fee__title').textContent = settings.title || this.dataset.title || 'Cart fee';
      this.querySelector('.cart-fee__info').textContent = settings.info || '';

      const checkbox = this.querySelector('.cart-fee__checkbox');
      checkbox.checked = cart.attributes?.cart_fee_opt_in === 'true';
      checkbox.addEventListener('change', () => this.setOptIn(checkbox));

      this.renderCart(cart);
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
      cart_fee_info: settings.info || '',
      cart_fee_opt_in: cart.attributes?.cart_fee_opt_in === 'true' ? 'true' : 'false',
    };
    const hasChanges = Object.entries(attributes).some(
      ([key, value]) => cart.attributes?.[key] !== value,
    );

    if (!hasChanges) return;

    const response = await fetch('/cart/update.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({attributes}),
    });

    if (!response.ok) throw new Error('Unable to sync cart fee settings.');
  }

  async setOptIn(checkbox) {
    const previousValue = !checkbox.checked;
    checkbox.disabled = true;

    try {
      const optedIn = checkbox.checked;
      const attributeResponse = await fetch('/cart/update.js', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({attributes: {cart_fee_opt_in: String(optedIn)}}),
      });

      if (!attributeResponse.ok) throw new Error('Unable to save the cart fee selection.');

      let cart = await this.fetchCart();
      let feeItem = this.findFeeItem(cart);

      if (optedIn && this.feeType === 'fixed' && Number.isSafeInteger(this.variantId)) {
        cart = await this.ensureSingleFeeItem();
        feeItem = this.findFeeItem(cart);
      } else if (!optedIn && feeItem) {
        cart = await this.removeFeeItem();
      }

      this.renderCart(cart);
      checkbox.checked = optedIn;
      checkbox.disabled = false;
    } catch (error) {
      console.error('Cart fee selection:', error);
      checkbox.checked = previousValue;
      checkbox.disabled = false;
      await fetch('/cart/update.js', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({attributes: {cart_fee_opt_in: String(previousValue)}}),
      }).catch(() => {});
    }
  }

  renderCart(cart) {
    const optedIn = cart.attributes?.cart_fee_opt_in === 'true';
    const feeItem = this.findFeeItem(cart);
    const baseTotal = cart.total_price - (feeItem ? Number(feeItem.final_line_price) : 0);
    const calculatedFee = this.calculateFee(baseTotal, this.feeType, this.feeValue);
    const fee = feeItem && optedIn && this.feeType === 'fixed'
      ? Number(feeItem.final_line_price)
      : calculatedFee;
    const total = feeItem && optedIn && this.feeType === 'fixed'
      ? cart.total_price
      : baseTotal + (optedIn ? calculatedFee : 0);

    this.querySelector('.cart-fee__value').textContent = this.formatMoney(fee, cart.currency);
    this.querySelector('.cart-fee__checkbox').checked = optedIn;

    if (this.totalValueElement) {
      this.totalValueElement.textContent = this.formatMoney(total, cart.currency);
    }
  }

  async fetchCart() {
    const response = await fetch('/cart.js');
    if (!response.ok) throw new Error('Unable to refresh the cart.');
    return response.json();
  }

  findFeeItem(cart) {
    if (!Number.isSafeInteger(this.variantId)) return null;
    return cart.items.find((item) => Number(item.variant_id) === this.variantId) || null;
  }

  hideFeeItem(feeItem) {
    if (!feeItem) return;

    const selectors = [
      `[data-key="${CSS.escape(feeItem.key)}"]`,
      `[data-line-key="${CSS.escape(feeItem.key)}"]`,
      `[data-variant-id="${feeItem.variant_id}"]`,
    ];

    const element = document.querySelector(
      selectors.join(', '),
    );

    if (!element) {
      console.warn(
        'Cart fee line element not found:',
        feeItem,
      );
      return;
    }

    element.classList.add('hidden');
  }

  async addFeeItem(variantId) {    
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        items: [{id: variantId, quantity: 1, properties: {_cart_fee: 'true'}}],
      }),
    });

    if (!response.ok) throw new Error('Unable to add the cart fee to the cart.');
  }

  async ensureSingleFeeItem() {
    return queueFeeCartMutation(async () => {
      let cart = await this.fetchCart();

      if (cart.attributes?.cart_fee_opt_in !== 'true') return cart;

      let feeItem = this.findFeeItem(cart);
      if (!feeItem) {
        await this.addFeeItem(this.variantId);
        cart = await this.fetchCart();
        feeItem = this.findFeeItem(cart);
      }

      if (feeItem) {
        await this.setFeeItemQuantity(feeItem, 1);
        cart = await this.fetchCart();
      }

      return cart;
    });
  }

  async setFeeItemQuantity(feeItem, quantity) {
    const response = await fetch('/cart/change.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: feeItem.key, quantity}),
    });

    if (!response.ok) throw new Error('Unable to set the cart fee quantity.');
  }

  async removeFeeItem() {
    return queueFeeCartMutation(async () => {
      const cart = await this.fetchCart();
      const currentFeeItem = this.findFeeItem(cart);
      if (!currentFeeItem) return cart;

      const response = await fetch('/cart/change.js', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: currentFeeItem.key, quantity: 0}),
      });

      if (!response.ok) throw new Error('Unable to remove the cart fee from the cart.');
      return response.json();
    });
  }

  calculateFee(cartTotal, type, configuredValue) {
    const value = Number(configuredValue);
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (type === 'fixed') return Math.round(value * 100);
    if (type === 'percentage') return Math.round(cartTotal * value / 100);
    return 0;
  }

  findTotalValue(root) {
    if (!root) return null;

    const knownValue = root.querySelector(
      '.totals__total-value, .cart-total__value, .cart-page__total-value, .cart-summary__total-value, [data-cart-total-value]',
    );
    if (knownValue) return knownValue;

    const totalRows = Array.from(root.querySelectorAll('*'))
      .filter((element) => {
        const text = element.textContent.trim();
        const isCartItem = element.closest?.(
          '.cart-item, .cart-item__totals, .cart-items, .cart__items, [data-cart-items]',
        );
        return /\btotal\b/i.test(text) && !/\bsubtotal\b/i.test(text) && !isCartItem;
      })
      .sort((left, right) => left.textContent.length - right.textContent.length);

    for (const row of totalRows) {
      const amount = Array.from(row.querySelectorAll('*'))
        .reverse()
        .find((element) => element.children.length === 0 && /\d/.test(element.textContent));

      if (amount) return amount;
    }

    return null;
  }

  findTotalRow(totalValue) {
    let candidate = totalValue?.parentElement;

    while (candidate && candidate !== document.body) {
      const text = candidate.textContent.trim();
      const isTotalRow = /\btotal\b/i.test(text) && !/\bsubtotal\b/i.test(text);
      const isCartItem = candidate.closest?.(
        '.cart-totals__item, .cart-item__totals, .cart-items, .cart__items, [data-cart-items]',
      );

      if (isTotalRow && !isCartItem) return candidate;      
      candidate = candidate.parentElement;
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
