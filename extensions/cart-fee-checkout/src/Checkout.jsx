import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const attributes = shopify.attributes.value || [];
    const getAttribute = (key) => attributes.find((attribute) => attribute.key === key)?.value;
    const enabled = getAttribute('cart_fee_enabled') === 'true';
    const variantId = getAttribute('cart_fee_variant_id');
    const feeType = getAttribute('cart_fee_type');

    if (!enabled || !variantId) {
      return;
    }

    const existingFee = shopify.lines.value.find(
      (line) => line.merchandise.id === variantId,
    );

    if (feeType !== 'fixed') {
      if (existingFee && shopify.instructions.value.lines.canRemoveCartLine) {
        shopify.applyCartLinesChange({
          type: 'removeCartLine',
          id: existingFee.id,
          quantity: existingFee.quantity,
        });
      }

      setMessage('Percentage fees are currently shown on the cart page only and are not charged at checkout.');
      return;
    }

    if (existingFee) {
      return;
    }

    if (!shopify.instructions.value.lines.canAddCartLine) {
      setMessage('The cart fee could not be added. Return to the cart to continue.');
      return;
    }

    shopify.applyCartLinesChange({
      type: 'addCartLine',
      merchandiseId: variantId,
      quantity: 1,
      attributes: [{key: '_cart_fee', value: 'true'}],
    }).then((result) => {
      if (result.type === 'error') {
        setMessage('The cart fee could not be added. Return to the cart to continue.');
      }
    }).catch(() => {
      setMessage('The cart fee could not be added. Return to the cart to continue.');
    });
  }, []);

  const messageTone = message.startsWith('Percentage fees') ? 'warning' : 'critical';

  return message ? <s-banner tone={messageTone}>{message}</s-banner> : null;
}