import { Form, useActionData, useLoaderData } from "react-router";
import { useEffect, useState } from "react";

import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import prisma from "../db.server";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

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

  let feeVariant = null;

  if (settings.feeVariantId) {
    const response = await admin.graphql(
      `#graphql
        query FeeVariantLookup($id: ID!) {
          productVariant(id: $id) {
            id
            title
            product {
              id
              title
            }
          }
        }
      `,
      {
        variables: {
          id: settings.feeVariantId,
        },
      },
    );

    const data = await response.json();
    feeVariant = data.data?.productVariant || null;
  }

  return {
    settings: {
      enabled: settings.enabled,
      title: settings.title,
      info: settings.info,
      type: settings.type,
      value: settings.value.toString(),
      feeVariantId: settings.feeVariantId || "",
      productTitle: feeVariant?.product?.title || "",
      feeVariantTitle: feeVariant?.title || "",
    },
  };
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const enabled = formData.get("enabled") === "on";

  const title = String(
    formData.get("title") || "Handling fee",
  );

  const info = String(
    formData.get("info") || "",
  ).trim();

  const type = String(
    formData.get("type") || "",
  );

  const value = Number(
    formData.get("value") || 0,
  );

  const feeVariantId = String(
    formData.get("feeVariantId") || "",
  ).trim();

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !["fixed", "percentage"].includes(type)
  ) {
    return {
      error: "Enter a valid fee type and a non-negative fee value.",
    };
  }

  // Validate the ProductVariant GID before sending it to Shopify.
  if (
    feeVariantId &&
    !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(feeVariantId)
  ) {
    return {
      error: "Please select a valid fee product variant.",
    };
  }

  if (feeVariantId) {
    const variantResponse = await admin.graphql(
      `#graphql
        query FeeVariantLookup($id: ID!) {
          productVariant(id: $id) {
            id
            product {
              id
            }
          }
        }
      `,
      {
        variables: {
          id: feeVariantId,
        },
      },
    );

    const variantData = await variantResponse.json();
    const variant = variantData.data?.productVariant;

    if (!variant) {
      return {
        error: "The selected fee product variant no longer exists.",
      };
    }

    const syncedPrice =
      enabled && type === "fixed"
        ? value.toFixed(2)
        : "0.00";

    const priceResponse = await admin.graphql(
      `#graphql
        mutation UpdateFeeVariantPrice(
          $productId: ID!
          $variantId: ID!
          $price: Money!
        ) {
          productVariantsBulkUpdate(
            productId: $productId
            variants: [
              {
                id: $variantId
                price: $price
              }
            ]
          ) {
            productVariants {
              id
              price
            }
            userErrors {
              field
              message
            }
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

    const priceErrors =
      priceData.data?.productVariantsBulkUpdate?.userErrors || [];

    if (priceErrors.length > 0) {
      return {
        error: priceErrors
          .map(({ message }) => message)
          .join(" "),
      };
    }
  }

  await prisma.cartFeeSettings.upsert({
    where: {
      shop: session.shop,
    },
    update: {
      enabled,
      title,
      info,
      type,
      value,
      feeVariantId: feeVariantId || null,
    },
    create: {
      shop: session.shop,
      enabled,
      title,
      info,
      type,
      value,
      feeVariantId: feeVariantId || null,
    },
  });

  return {
    success: true,
    savedAt: Date.now(),
  };
}

export default function Index() {
  const { settings } = useLoaderData();
  const actionData = useActionData();
  const shopify = useAppBridge();

  const [formValues, setFormValues] = useState(settings);
  const [showSuccess, setShowSuccess] = useState(false);

  const isDirty = JSON.stringify(formValues) !== JSON.stringify(settings);
  
  const handleChange = (event) => {
    const field = event.currentTarget;

    if (!field?.name) {
      return;
    }

    const value =
      field.name === "enabled"
        ? field.checked
        : field.value;

    setFormValues((current) => ({
      ...current,
      [field.name]: value,
    }));
  };

  const handleSelectVariant = async () => {
    const selected = await shopify.resourcePicker({
      type: "variant",
      action: "select",
      multiple: false,
    });

    if (!selected?.length) {
      return;
    }

    const variant = selected[0];

    setFormValues((current) => ({
      ...current,
      feeVariantId: variant.id || "",
      productTitle: variant.product?.title || "",
      feeVariantTitle: variant.title || "",
    }));
  };

  useEffect(() => {
    if (!actionData?.success) {
      return;
    }

    setShowSuccess(true);

    const timer = setTimeout(() => {
      setShowSuccess(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [actionData?.savedAt]);

  return (
    <s-page heading="Cart Fee">
      <Form method="post">
        {actionData?.error ? (
          <s-banner tone="critical">
            {actionData.error}
          </s-banner>
        ) : null}

        {showSuccess ? (
          <s-banner
            tone="success"
            style={{
              position: "absolute", 
              top: "0",
              left: "0",
              right: "0",
              zIndex: 1000              
            }}
          >
            Settings saved.
          </s-banner>
        ) : null}
        
        <s-section heading="Fee settings">
          <s-checkbox
            name="enabled"
            label="Enable cart fee"
            checked={formValues.enabled}
            onChange={handleChange}
          />

          <s-text-field
            name="title"
            label="Fee title"
            value={formValues.title} 
            disabled={!formValues.enabled}           
            onChange={handleChange}
          />

          <s-text-field
            name="info"
            label="Information below the title"
            value={formValues.info}
            disabled={!formValues.enabled}
            onChange={handleChange}
          />

          <label htmlFor="fee-type">
            Fee type
          </label>

          <select
            id="fee-type"
            name="type"
            value={formValues.type}
            onChange={handleChange}
            disabled={!formValues.enabled}
            className="fee-type-select"
            style={{
              width: "100%",
              minHeight: "40px",
              padding: "8px 12px",
              border: "1px solid #8c9196",
              borderRadius: "4px",
              backgroundColor: "#fff",
              color: "#202223",
              font: "inherit",
            }}
          >
            <option value="percentage">
              Percentage
            </option>

            <option value="fixed">
              Fixed amount
            </option>
          </select>

          <s-number-field
            name="value"
            label="Fee value"
            value={formValues.value}
            min="0"
            step="0.01"
            onChange={handleChange}
            disabled={!formValues.enabled}
          />

          <input
            type="hidden"
            name="feeVariantId"
            value={formValues.feeVariantId}
          />

          <s-button
            type="button"
            onClick={handleSelectVariant}
            disabled={!formValues.enabled}
          >
            {formValues.feeVariantTitle
              ? "Change fee product variant"
              : "Select fee product variant"}
          </s-button>

          {formValues.feeVariantTitle ? (
            <s-text>
              {formValues.productTitle}:{" "}
              {formValues.feeVariantTitle}
            </s-text>
          ) : (
            <s-text>
              Select the product variant used for the cart fee.
            </s-text>
          )}

          <s-button
            type="submit"
            variant="primary"
            disabled={!isDirty}
          >
            Save settings
          </s-button>
        </s-section>
      </Form>
    </s-page>
  );
}