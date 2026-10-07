import {Form, useActionData, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";

export async function loader({request}) {
  const {session} = await authenticate.admin(request);

  let settings = await prisma.cartFeeSettings.findUnique({
    where: {
      shop: session.shop,
    },
  });

  if (!settings) {
    settings = await prisma.cartFeeSettings.create({
      data: {
        shop: session.shop,
      },
    });
  }

  return {
    settings: {
      enabled: settings.enabled,
      title: settings.title,
      type: settings.type,
      value: settings.value.toString(),
      feeVariantId: settings.feeVariantId || "",
    },
  };
}

export async function action({request}) {
  const {admin, session} = await authenticate.admin(request);

  const formData = await request.formData();

  const enabled = formData.get("enabled") === "on";
  const title = String(formData.get("title") || "Handling fee");
  const type = String(formData.get("type"));
  const value = Number(formData.get("value") || 0);
  const feeVariantInput = String(formData.get("feeVariantId") || "").trim();
  const feeVariantId = /^\d+$/.test(feeVariantInput)
    ? `gid://shopify/ProductVariant/${feeVariantInput}`
    : feeVariantInput;

  if (!Number.isFinite(value) || value < 0 || !["fixed", "percentage"].includes(type)) {
    return {error: "Enter a valid fee type and a non-negative fee value."};
  }

  if (enabled && !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(feeVariantId)) {
    return {error: "Enter the numeric ID or full GID of an existing fee product variant."};
  }

  if (feeVariantId) {
    const variantResponse = await admin.graphql(
      `#graphql
        query FeeVariantLookup($id: ID!) {
          productVariant(id: $id) {
            id
            product { id }
          }
        }
      `,
      {variables: {id: feeVariantId}},
    );
    const variantData = await variantResponse.json();
    const variant = variantData.data?.productVariant;

    if (!variant) {
      return {error: "The fee variant GID was not found in this store."};
    }

    const syncedPrice = enabled && type === "fixed" ? value.toFixed(2) : "0.00";
    const priceResponse = await admin.graphql(
      `#graphql
        mutation UpdateFeeVariantPrice($productId: ID!, $variantId: ID!, $price: Money!) {
          productVariantsBulkUpdate(
            productId: $productId
            variants: [{id: $variantId, price: $price}]
          ) {
            productVariants { id price }
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          productId: variant.product.id,
          variantId: feeVariantId,
          price: syncedPrice,
        },
      },
    );
    const priceData = await priceResponse.json();
    const priceErrors = priceData.data?.productVariantsBulkUpdate?.userErrors || [];

    if (priceErrors.length > 0) {
      return {error: priceErrors.map(({message}) => message).join(" ")};
    }

  }

  await prisma.cartFeeSettings.upsert({
    where: {
      shop: session.shop,
    },
    update: {
      enabled,
      title,
      type,
      value,
      feeVariantId: feeVariantId || null,
    },
    create: {
      shop: session.shop,
      enabled,
      title,
      type,
      value,
      feeVariantId: feeVariantId || null,
    },
  });

  return {
    success: true,
  };
}

export default function Index() {
  const {settings} = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Cart Fee">
      <Form method="post">
        {actionData?.error ? <s-banner tone="critical">{actionData.error}</s-banner> : null}
        <s-section heading="Fee settings">
          <s-checkbox
            name="enabled"
            label="Enable cart fee"
            checked={settings.enabled}
          />

          <s-text-field
            name="title"
            label="Fee title"
            value={settings.title}
          />
          <s-select
            name="type"
            label="Fee type"
            value={settings.type}
          >
            <s-option value="percentage">Percentage</s-option>
            <s-option value="fixed">Fixed amount</s-option>
          </s-select>

          <s-number-field
            name="value"
            label="Fee value"
            value={settings.value}
            min="0"
            step="0.01"
          />

          <s-text-field
            name="feeVariantId"
            label="Fee product variant ID"
            value={settings.feeVariantId}
          />
          <s-text>
            Enter the numeric variant ID or full Shopify GID. Use an active, non-shipping fee product variant. Fixed fees are charged at checkout; percentage fees are currently display-only.
          </s-text>

          <s-button type="submit" variant="primary">
            Save settings
          </s-button>
        </s-section>
      </Form>
    </s-page>
  );
}