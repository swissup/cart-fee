class CartFee extends HTMLElement {
  connectedCallback() {
    this.load();
  }

  async load() {    
    try {
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

      if (!settings.enabled || cart.item_count === 0) {
        this.remove();
        return;
      }

      const fee = this.calculateFee(settings, cart);

      if (fee <= 0) {
        this.remove();
        return;
      }

      const titleElement = this.querySelector('.cart-fee__title');
      const valueElement = this.querySelector('.cart-fee__value');

      titleElement.textContent = settings.title;
      valueElement.textContent = this.formatMoney(
        fee,
        cart.currency,
      );

      this.hidden = false;
    } catch (error) {
      console.error('Cart fee:', error);
      this.remove();
    }
  }

  calculateFee(settings, cart) {
    return Math.round(
      cart.total_price * Number(settings.value) / 100,
    );
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